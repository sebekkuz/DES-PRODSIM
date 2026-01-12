import PriorityQueue from './priority_queue.js'; // Upewnij się, że ten plik jest w src/logic lub popraw ścieżkę
import { ResourcePool } from './simulation_models.js';
import { SimulationEventHandler } from './SimulationEventHandler.js';

class SimulationEngine {
    constructor() {
        this.reset();
        this.scheduler = this; // Self-reference dla zachowania API wewnątrz Handlera
        // Inicjalizacja "mózgu" symulacji
        this.handler = new SimulationEventHandler(this);
    }

    reset() {
        this.log = [];
        this.eventQueue = new PriorityQueue((a, b) => a.time < b.time);
        this.simulationTime = 0;
        this.config = {}; 
        this.db = {}; 
        this.mrp = []; 
        this.settings = {};
        this.workerPools = {}; 
        this.toolPools = {};
        this.parts = {}; 
        this.partCounter = 0;
        this.bufferStates = {}; 
        this.stationStates = {}; 
        this.replayEvents = []; 
        this.orderMap = {};
        
        this.stats = { 
            partsProcessed: 0, 
            partsScrapped: 0, 
            cycleTimes: [], 
            workInProcess: [], 
            bottleneckSnapshots: [] 
        };
        this.shiftsConfig = {};
    }

    logMessage(msg) { 
        // Opcjonalne logowanie debugowe
        // this.log.push(msg); 
    }

    // --- REJESTROWANIE ZDARZEŃ DLA WIZUALIZACJI ---

    recordStateChange(stationId, status, meta = {}) {
        this.replayEvents.push({ 
            type: 'STATION_STATE', 
            time: this.simulationTime, 
            stationId, 
            status, 
            meta 
        });
    }

    recordBufferState(bufferId, queue) {
        // Zapisujemy tylko pierwsze 50 elementów dla wydajności
        const contentList = queue.slice(0, 50).map(id => { 
            const p = this.parts[id]; 
            return p ? { code: p.code, orderId: p.orderId } : { code: '?', orderId: '?' }; 
        });
        this.replayEvents.push({ 
            type: 'BUFFER_STATE', 
            time: this.simulationTime, 
            bufferId, 
            count: queue.length, 
            content: contentList 
        });
    }

    recordTransport(part, fromId, toId, startTime, arrivalTime) {
        let subCode = part.code.includes('-') ? part.code.split('-').pop() : part.code;
        this.replayEvents.push({ 
            type: 'TRANSPORT', 
            startTime, 
            endTime: arrivalTime, 
            from: fromId, 
            to: toId, 
            partId: part.id, 
            orderId: part.orderId, 
            partCode: part.code, 
            subCode, 
            isAssembled: part.attachedChildren?.length > 0, 
            duration: arrivalTime - startTime 
        });
    }

    recordWorkerTravel(poolId, stationId, startTime, arrivalTime) {
        this.replayEvents.push({ 
            type: 'WORKER_TRAVEL', 
            startTime, 
            endTime: arrivalTime, 
            from: poolId, 
            to: stationId 
        });
    }

    recordResourceUsage(poolId, usageType, partId, startTime, endTime, meta = {}) {
        this.replayEvents.push({ 
            type: 'RESOURCE_USAGE', 
            poolId, 
            usageType, 
            startTime, 
            endTime, 
            duration: endTime - startTime, 
            partId, 
            meta 
        });
    }

    // --- SCHEDULER I CZAS PRACY ---

    isWorkingTime(timeHour) {
        const dayIndex = Math.floor(timeHour / 24); 
        const hourOfDay = timeHour % 24;
        
        if (!this.shiftsConfig || Object.keys(this.shiftsConfig).length === 0) return true;
        
        let isWorking = false;
        Object.values(this.shiftsConfig).forEach(shift => {
            if (!shift.active) return;
            if ((dayIndex % 7) >= shift.days) return; // Dni tygodnia (0-6)
            
            const [sH, sM] = shift.start.split(':').map(Number);
            const [eH, eM] = shift.end.split(':').map(Number);
            const s = sH + sM/60; 
            const e = eH + eM/60;
            
            if (e > s) { 
                if (hourOfDay >= s && hourOfDay < e) isWorking = true; 
            } else { 
                // Przejście przez północ
                if (hourOfDay >= s || hourOfDay < e) isWorking = true; 
            }
        });
        return isWorking;
    }

    calculateCompletionTime(startTime, durationHours) {
        let remaining = durationHours; 
        let cursor = startTime; 
        let iter = 0;
        
        // Przesuń kursor do najbliższego czasu pracy, jeśli startujemy w przerwie
        while (!this.isWorkingTime(cursor) && iter < 168) { 
            cursor += 1.0; 
            iter++; 
        }
        
        iter = 0;
        while (remaining > 0.0001 && iter < 100000) { // Zwiększony limit iteracji dla bezpieczeństwa
            iter++;
            if (this.isWorkingTime(cursor)) {
                const step = 0.5; // Krok półgodzinny dla precyzji
                const work = Math.min(remaining, step);
                cursor += work; 
                remaining -= work;
            } else { 
                cursor += 1.0; // Przeskok o godzinę w czasie wolnym
            }
        }
        return cursor;
    }
    
    getHourDifference(startDateStr, endDateStr) {
        try {
            // Format oczekiwany: DD-MM-YYYY
            const parts = startDateStr.split('-'); 
            const d1 = new Date(parts[2], parts[1]-1, parts[0]);
            
            const p2 = endDateStr.split('-'); 
            const d2 = new Date(p2[2], p2[1]-1, p2[0]);
            
            return (d2 - d1) / 3600000;
        } catch(e) { return 0; }
    }

    // --- INITIALIZATION & MAIN LOOP ---

    runSimulation(config, db, mrp, settings) {
        this.reset();
        this.config = config; 
        this.db = db; 
        this.mrp = mrp; 
        this.settings = settings || {};
        this.shiftsConfig = this.settings.shifts || {};
        
        // Re-inicjalizacja Handlera z nowym stanem silnika
        this.handler = new SimulationEventHandler(this);

        // Init Stanów Bufory
        this.config.buffers.forEach(b => {
            this.bufferStates[b.id] = { 
                queue: [], maxQueue: 0, sumQueue: 0, queueSamples: 0 
            };
        });

        // Init Stanów Stacje
        this.config.stations.forEach(s => {
            this.stationStates[s.id] = { 
                queue: [], busySlots: 0, totalBusyTime: 0, incoming: 0, 
                maxQueue: 0, sumQueue: 0, queueSamples: 0, breakdowns: [] 
            };
        });

        // Init Pule Pracowników/Narzędzi
        if(this.config.workerPools) {
            this.config.workerPools.forEach(p => {
                this.workerPools[p.id] = new ResourcePool(p.name, p.capacity, p.speed, this);
            });
        }
        if(this.config.toolPools) {
            this.config.toolPools.forEach(p => {
                this.toolPools[p.id] = new ResourcePool(p.name, p.capacity, p.speed, this);
            });
        }

        // Init Zleceń (MRP)
        this.mrp.forEach((order, idx) => {
            const date = order['Data zlecenia'] || order['Data  zlecenia']; // Obsługa literówki w starych plikach
            const due = order['Termin'];
            const str = order['Sekcje']; 
            const sz = order['Rozmiar'];
            
            if(!date || !str || !sz) return;
            
            const startT = Math.max(0, this.getHourDifference(this.settings.startDate, date));
            // Czas przybycia materiału = startT + 0 (natychmiast w dniu zlecenia)
            const arrT = this.calculateCompletionTime(startT, 0);
            
            this.scheduleEvent(arrT, 'ORDER_ARRIVAL', { 
                order: { 
                    orderId: order['Zlecenie'] || `ORD_${idx}`, 
                    orderString: str, 
                    orderSize: sz, 
                    dueDate: due 
                }
            });
        });

        this.run();
        return this.log;
    }

    run() {
        let steps = 0; 
        const MAX_STEPS = 2000000; // Zwiększony limit kroków
        
        while (!this.eventQueue.isEmpty() && steps < MAX_STEPS) {
            steps++;
            const evt = this.eventQueue.pop();
            this.simulationTime = evt.time;
            this.handleEvent(evt);
        }
        
        this.finalizeSimulation();
    }

    handleEvent(e) { 
        this.handler.handleEvent(e); 
    }

    scheduleEvent(t, type, payload) { 
        this.eventQueue.push({ time: t, type, payload }); 
    }

    finalizeSimulation() {
        // Podstawowa agregacja wyników
        self.postMessage({ 
            type: 'SIMULATION_RESULTS', 
            payload: { 
                replayEvents: this.replayEvents, 
                duration: this.simulationTime,
                produced: this.stats.partsProcessed,
                scrapped: this.stats.partsScrapped,
                // Można tu dodać więcej statystyk zgodnych z Legacy
                stats: this.stats 
            }
        });
    }
}

// Global Engine Instance
let engine;

self.onmessage = (e) => {
    if(e.data.type === 'START_SIMULATION') {
        if(!engine) engine = new SimulationEngine();
        engine.runSimulation(e.data.payload.config, null, e.data.payload.mrp, e.data.payload.settings);
    }
};