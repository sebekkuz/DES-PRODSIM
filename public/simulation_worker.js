// simulation_worker.js
'use strict';

// KROK 0: Importujemy kolejkę priorytetową
try {
    importScripts('priority_queue.js');
} catch (e) {
    console.error("Worker: Nie udało się załadować 'priority_queue.js'", e);
    self.postMessage({ type: 'FATAL_ERROR', payload: ["Nie można załadować 'priority_queue.js'. Upewnij się, że plik jest w folderze public."] });
}

/**
 * ==========================================================================
 * CZĘŚĆ 1: MODELE SYMULACJI
 * ==========================================================================
 */

class Part {
    constructor(id, orderId, partType, partCode, size, routing, childrenBOM, creationTime, dueDate = null) {
        this.id = `part_${id}`;
        this.orderId = orderId;
        this.type = partType;   // 'PARENT' (Obudowa) lub 'CHILD' (Funkcja)
        this.code = partCode;   // np. 'M1', 'F'
        this.size = size;       // np. 'VS021'
        this.routing = routing || []; 
        this.routingStep = 0;   
        
        this.childrenBOM = childrenBOM || []; 
        this.attachedChildren = []; 
        
        this.state = 'CREATED'; 
        this.currentLocation = null; 
        
        // === KPI CZASOWE ===
        this.creationTime = creationTime;
        this.finishTime = null; 
        this.lastStateChangeTime = creationTime;
        this.dueDate = dueDate; 

        // === KPI FINANSOWE ===
        this.materialCost = partType === 'PARENT' ? 100 : 20;
        
        // === KPI JAKOŚCIOWE ===
        this.isScrapped = false; 

        this.stats = {
            processingTime: 0, 
            transportTime: 0,  
            waitTime: 0,       
            blockedTime: 0     
        };
    }
    
    updateState(newState, currentTime) {
        const duration = Math.max(0, currentTime - this.lastStateChangeTime);
        
        switch (this.state) {
            case 'PROCESSING': this.stats.processingTime += duration; break;
            case 'IN_TRANSPORT':
            case 'WAITING_FOR_WORKER_TRAVEL': this.stats.transportTime += duration; break;
            case 'IDLE_IN_BUFFER':
            case 'IDLE_AT_STATION':
            case 'WAITING_FOR_WORKER':
            case 'WAITING_FOR_TOOL': this.stats.waitTime += duration; break;
            case 'BLOCKED': this.stats.blockedTime += duration; break;
        }
        
        this.state = newState;
        this.lastStateChangeTime = currentTime;
        
        if (newState === 'FINISHED' || newState === 'SCRAPPED') {
            this.finishTime = currentTime;
        }
    }

    getNextOperation() {
        if (this.routingStep < this.routing.length) {
            return this.routing[this.routingStep];
        }
        return null; 
    }
}

class ResourcePool {
    constructor(name, capacity, speed, engine, costPerHour) {
        this.name = name;
        this.capacity = capacity;
        this.speed = speed || 1.0; 
        this.costPerHour = costPerHour || 0;
        this.available = capacity;
        this.waitQueue = []; 
        this.engine = engine; 
        this.totalBusyTimeSeconds = 0; 
        
        if (!this.engine || !this.engine.logMessage) {
            this.engine = { logMessage: (msg) => {} };
        }
    }

    request(entity, count) {
        // Fix: Twarda walidacja - nie bierzemy więcej niż mamy w puli
        if (count > this.capacity) {
             return false;
        }
        
        // Fix: Blokada startu, jeśli brakuje wymaganej liczby pracowników (np. trzeba 2, jest 1)
        if (this.available >= count) {
            this.available -= count;
            return true;
        } else {
            // Dodajemy do kolejki tylko jeśli jeszcze tam nie ma tego elementu (unikamy duplikatów)
            const exists = this.waitQueue.some(item => item.entity.id === entity.id);
            if (!exists) {
                this.waitQueue.push({ entity, count });
            }
            return false;
        }
    }

    release(entityReleasing, count, busyTimeDuration = 0) {
        this.available += count;
        // Zabezpieczenie przed błędami zaokrągleń
        if (this.available > this.capacity) this.available = this.capacity;

        this.totalBusyTimeSeconds += (busyTimeDuration * 3600 * count);

        if (this.waitQueue.length > 0) {
            const nextInQueue = this.waitQueue[0];
            // Fix: Zwalniamy kolejkę tylko, jeśli mamy PEŁNĄ wymaganą obsadę dla oczekującego
            if (this.available >= nextInQueue.count) {
                this.available -= nextInQueue.count;
                const unblocked = this.waitQueue.shift();
                return unblocked.entity; 
            }
        }
        return null;
    }
}

/**
 * ==========================================================================
 * CZĘŚĆ 2: SILNIK SYMULACJI
 * ==========================================================================
 */

class SimulationEngine {
    constructor() {
        this.reset();
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
        this.log.push(msg);
    }
    
    // === REJESTRACJA ZDARZEŃ ===

    recordStateChange(stationId, status, meta = {}) {
        this.replayEvents.push({
            type: 'STATION_STATE',
            time: this.simulationTime,
            stationId: stationId,
            status: status,
            meta: meta
        });
    }

    recordBufferState(bufferId, queue) {
        const contentList = queue.slice(0, 50).map(partId => {
            const p = this.parts[partId];
            return p ? { code: p.code, orderId: p.orderId } : { code: '?', orderId: '?' };
        });

        this.replayEvents.push({
            type: 'BUFFER_STATE',
            time: this.simulationTime,
            bufferId: bufferId,
            count: queue.length,
            content: contentList 
        });
    }

    recordTransport(part, fromId, toId, startTime, arrivalTime) {
        let subCode = part.code;
        if (part.code.includes('-')) {
            const segments = part.code.split('-');
            subCode = segments[segments.length-1]; 
        }

        this.replayEvents.push({
            type: 'TRANSPORT',
            startTime: startTime,
            endTime: arrivalTime,
            from: fromId,
            to: toId,
            partId: part.id,
            orderId: part.orderId,
            partCode: part.code, 
            subCode: subCode,       
            isAssembled: part.attachedChildren.length > 0,
            duration: arrivalTime - startTime
        });
    }

    recordWorkerTravel(poolId, stationId, startTime, arrivalTime) {
        this.replayEvents.push({
            type: 'WORKER_TRAVEL',
            startTime: startTime,
            endTime: arrivalTime,
            from: poolId, 
            to: stationId 
        });
    }

    recordResourceUsage(poolId, usageType, partId, startTime, endTime, meta = {}) {
        this.replayEvents.push({
            type: 'RESOURCE_USAGE',
            poolId: poolId,
            usageType: usageType,
            startTime: startTime,
            endTime: endTime,
            duration: endTime - startTime,
            partId: partId,
            meta: meta
        });
    }

    // === LOGIKA ZMIANOWOŚCI ===
    isWorkingTime(timeHour) {
        const dayIndex = Math.floor(timeHour / 24); 
        const hourOfDay = timeHour % 24; 
        
        if (!this.shiftsConfig) return true; 

        let isWorking = false;
        Object.values(this.shiftsConfig).forEach(shift => {
            if (!shift.active) return;
            const currentDayOfWeek = dayIndex % 7;
            if (currentDayOfWeek >= shift.days) return; 

            const [sH, sM] = shift.start.split(':').map(Number);
            const [eH, eM] = shift.end.split(':').map(Number);
            const startVal = sH + sM/60;
            const endVal = eH + eM/60;

            if (endVal > startVal) {
                if (hourOfDay >= startVal && hourOfDay < endVal) isWorking = true;
            } else {
                if (hourOfDay >= startVal || hourOfDay < endVal) isWorking = true;
            }
        });
        return isWorking;
    }

    calculateCompletionTime(startTime, durationHours) {
        let remainingWork = durationHours;
        let cursor = startTime;
        const MAX_ITERATIONS = 10000; 
        let iterations = 0;

        // Szukaj początku pracy
        while (!this.isWorkingTime(cursor) && iterations < 168) {
             const timeToNextHour = Math.ceil(cursor) - cursor;
             cursor += (timeToNextHour === 0 ? 1.0 : timeToNextHour);
             iterations++;
        }
        iterations = 0;

        while (remainingWork > 0.0001 && iterations < MAX_ITERATIONS) {
            iterations++;
            if (this.isWorkingTime(cursor)) {
                const timeToNextHour = Math.ceil(cursor) - cursor;
                const step = (timeToNextHour === 0) ? 1.0 : timeToNextHour; 
                const workToDo = Math.min(remainingWork, step);
                cursor += workToDo;
                remainingWork -= workToDo;
            } else {
                const timeToNextHour = Math.ceil(cursor) - cursor;
                cursor += (timeToNextHour === 0 ? 1.0 : timeToNextHour);
            }
        }
        return cursor;
    }
    
    calculateWorkingHoursDuration(totalDuration) {
        let paidHours = 0;
        for (let t = 0; t < totalDuration; t++) {
            if (this.isWorkingTime(t)) paidHours += 1;
        }
        return paidHours;
    }

    getHourDifference(startDateStr, endDateStr) {
        try {
            const parseDate = (str) => {
                const parts = str.split('-');
                if (parts[0].length === 2) return new Date(parts[2], parts[1] - 1, parts[0]);
                return new Date(parts[0], parts[1] - 1, parts[2]);
            };
            const start = parseDate(startDateStr);
            const end = parseDate(endDateStr);
            const diffMs = end - start;
            return (diffMs / (1000 * 60 * 60)); 
        } catch (e) { return 0; }
    }

    // === START SYMULACJI ===
    runSimulation(config, db, mrp, settings) {
        this.reset();
        this.config = config;
        this.db = db;
        this.mrp = mrp;
        this.settings = settings || { startDate: '18-11-2025' };
        this.shiftsConfig = this.settings.shifts || {};

        this.config.buffers.forEach(buffer => { 
            this.bufferStates[buffer.id] = { queue: [], maxQueue: 0, sumQueue: 0, queueSamples: 0 }; 
        });
        
        this.config.stations.forEach(station => { 
            this.stationStates[station.id] = { 
                queue: [], 
                busySlots: 0, 
                totalBusyTime: 0, 
                totalStarvedTime: 0, 
                maxQueue: 0, 
                sumQueue: 0, 
                queueSamples: 0,
                breakdowns: [],
                incoming: 0 // Nowe pole: elementy w transporcie do tej stacji
            }; 
        });

        if (this.config.workerPools) {
            this.config.workerPools.forEach(pool => {
                this.workerPools[pool.id] = new ResourcePool(pool.name, pool.capacity, pool.speed, this, pool.costPerHour);
            });
        }
        
        if (this.config.toolPools) {
            this.config.toolPools.forEach(pool => {
                this.toolPools[pool.id] = new ResourcePool(pool.name, pool.capacity, pool.speed, this, 0);
            });
        }

        this.mrp.forEach((order, index) => {
            const orderDate = order['Data  zlecenia'] || order['Data zlecenia'];
            const orderDueDate = order['Termin'] || order['Data realizacji'] || null; 
            
            let orderId = order['Zlecenie'];
            if (!orderId) {
                const size = order['Rozmiar'] || 'Nieznany';
                orderId = `${index + 1}. ${size}`; 
            }
            
            const orderString = order['Sekcje']; 
            const orderSize = order['Rozmiar']; 
            
            if (!orderDate || !orderString || !orderSize) return;
            
            const arrivalTime = this.getHourDifference(this.settings.startDate, orderDate);
            let dueTime = null;
            
            if (orderDueDate) {
                dueTime = this.getHourDifference(this.settings.startDate, orderDueDate);
                if (dueTime < arrivalTime) dueTime = arrivalTime + 24;
            }
            
            const safeArrivalTime = Math.max(0, arrivalTime);
            // Stagger: Delikatne opóźnienie, aby uniknąć idealnej synchronizacji "Wybuchu" na starcie
            const workStartArrivalTime = this.calculateCompletionTime(safeArrivalTime, 0);

            this.scheduleEvent(
                workStartArrivalTime, 
                'ORDER_ARRIVAL', 
                { order: { orderId, orderString, orderSize, dueDate: dueTime } }
            );
        });
        
        if (this.eventQueue.isEmpty()) {
            this.logMessage("[Engine] Brak zleceń lub błędne daty.");
        } else {
            this.run();
        }
        return this.log;
    }

    run() {
        // Fix: Zabezpieczenie przed brakiem zmian
        const anyShiftActive = Object.values(this.shiftsConfig).some(s => s.active);
        if (!anyShiftActive) {
            this.logMessage("! BŁĄD KRYTYCZNY: Brak aktywnych zmian. Fabryka nie pracuje.");
            self.postMessage({ type: 'SIMULATION_RESULTS', payload: { error: "Brak aktywnych zmian w ustawieniach." } });
            return;
        }

        this.logMessage(`[Engine] Start symulacji.`);
        let steps = 0;
        const MAX_STEPS = 800000; 
        let nextWipSample = 0.0;

        while (!this.eventQueue.isEmpty()) {
            steps++;
            if (steps > MAX_STEPS) {
                this.logMessage(`! BŁĄD KRYTYCZNY: Przekroczono limit kroków.`);
                break;
            }
            
            const event = this.eventQueue.pop(); 
            
            if (isNaN(event.time)) {
                this.logMessage(`! BŁĄD KRYTYCZNY: Czas NaN.`);
                break;
            }
            
            const timeDelta = event.time - this.simulationTime;
            if (timeDelta > 0 && this.isWorkingTime(this.simulationTime)) {
                 this.updateStarvationStats(timeDelta); 
            }
            
            this.simulationTime = event.time;
            
            if (this.simulationTime >= nextWipSample) {
                const activeParts = Object.values(this.parts).filter(p => p.state !== 'FINISHED' && p.state !== 'SCRAPPED');
                this.stats.workInProcess.push({ 
                    time: this.simulationTime, 
                    count: activeParts.length,
                    value: activeParts.reduce((sum, p) => sum + p.materialCost, 0) 
                });
                
                let maxLoad = -1;
                let bottleNeckId = null;
                Object.keys(this.stationStates).forEach(sId => {
                    const st = this.stationStates[sId];
                    const def = this.config.stations.find(s => s.id === sId);
                    const currentLoad = st.busySlots / (def.capacity || 1);
                    if (currentLoad > maxLoad) { maxLoad = currentLoad; bottleNeckId = sId; }
                });
                if (bottleNeckId && maxLoad > 0) {
                    this.stats.bottleneckSnapshots.push({ time: this.simulationTime, stationId: bottleNeckId, load: maxLoad });
                }
                nextWipSample += 1.0; 
            }

            this.handleEvent(event);
        }
        
        this.finalizeSimulation();
    }
    
    updateStarvationStats(timeDelta) {
        if (timeDelta <= 0) return;
        Object.keys(this.stationStates).forEach(stationId => {
            const state = this.stationStates[stationId];
            const stationDef = this.config.stations.find(s => s.id === stationId);
            const capacity = stationDef.capacity || 1;

            if (state.queue.length === 0 && state.busySlots < capacity) {
                const starvedSlots = capacity - state.busySlots;
                state.totalStarvedTime += (timeDelta * starvedSlots); 
            }
        });
    }

    // === AGREGACJA DANYCH ===
    calculateDetailedStats() {
        const orderStats = {};
        const productStats = {};

        Object.values(this.parts).forEach(part => {
            if (!orderStats[part.orderId]) {
                orderStats[part.orderId] = {
                    id: part.orderId,
                    code: this.orderMap[part.orderId] || '', 
                    size: part.size, 
                    dueDate: part.dueDate,
                    startTime: part.creationTime,
                    endTime: part.finishTime || this.simulationTime,
                    totalParts: 0,
                    finishedParts: 0,
                    scrappedParts: 0,
                    componentsStatus: { processing: [], ready: [], todo: [] }
                };
            }
            const order = orderStats[part.orderId];
            if (part.creationTime < order.startTime) order.startTime = part.creationTime;
            if (part.finishTime && part.finishTime > order.endTime) order.endTime = part.finishTime;
            order.totalParts++;
            
            if (part.state === 'FINISHED') order.finishedParts++;
            if (part.state === 'SCRAPPED') order.scrappedParts++;

            let subCode = part.code.includes('-') ? part.code.split('-').pop() : part.code;
            
            if (part.state === 'PROCESSING' || part.state === 'IN_TRANSPORT') {
                order.componentsStatus.processing.push(subCode);
            } else if (part.state === 'IDLE_IN_BUFFER' || part.state === 'ASSEMBLED' || part.state === 'FINISHED') {
                order.componentsStatus.ready.push(subCode);
            } else {
                order.componentsStatus.todo.push(subCode);
            }

            if (['FINISHED', 'ASSEMBLED', 'SCRAPPED'].includes(part.state)) {
                const key = `${part.type}_${part.code}`;
                if (!productStats[key]) {
                    productStats[key] = {
                        type: part.type === 'CHILD' ? 'Funkcja' : 'Obudowa',
                        code: part.code,
                        count: 0,
                        scraps: 0,
                        processingTimes: [],
                        waitTimes: [],
                        otherTimes: []
                    };
                }
                const pStat = productStats[key];
                pStat.count++;
                if (part.state === 'SCRAPPED') pStat.scraps++;
                pStat.processingTimes.push(part.stats.processingTime);
                pStat.waitTimes.push(part.stats.waitTime);
                pStat.otherTimes.push(part.stats.transportTime + part.stats.blockedTime);
            }
        });

        const processedOrders = Object.values(orderStats).map(o => {
            const duration = o.endTime - o.startTime;
            let status = 'OK';
            if (o.scrappedParts > 0) status = 'BRAKI';
            let onTime = true;
            if (o.dueDate) {
                if (o.endTime > o.dueDate) { status = 'OPÓŹNIONE'; onTime = false; }
            } else { status = 'BEZ TERMINU'; }

            return {
                id: o.id,
                code: o.code,
                size: o.size,
                duration: duration.toFixed(2),
                progress: `${o.finishedParts}/${o.totalParts}`,
                scraps: o.scrappedParts,
                onTime: onTime,
                status: status,
                startTime: o.startTime,
                endTime: o.endTime,
                componentsStatus: o.componentsStatus 
            };
        });

        const getStats = (arr) => {
            if (arr.length === 0) return { min: 0, max: 0, avg: 0 };
            const sum = arr.reduce((a, b) => a + b, 0);
            return {
                min: Math.min(...arr).toFixed(2),
                max: Math.max(...arr).toFixed(2),
                avg: (sum / arr.length).toFixed(2)
            };
        };

        const processedProducts = Object.values(productStats).map(p => ({
            type: p.type,
            code: p.code,
            count: p.count,
            scrapRate: ((p.scraps / p.count) * 100).toFixed(1) + '%',
            process: getStats(p.processingTimes),
            wait: getStats(p.waitTimes),
            other: getStats(p.otherTimes)
        }));

        return { orders: processedOrders, products: processedProducts };
    }

    finalizeSimulation() {
        const duration = this.simulationTime;
        if (duration === 0) {
             self.postMessage({ type: 'SIMULATION_RESULTS', payload: { error: "Czas symulacji wynosi 0." } });
             return;
        }

        const workingHoursTotal = this.calculateWorkingHoursDuration(duration);
        
        let avgLeadTime = 0;
        let avgFlowEfficiency = 0;
        let leadTimeBreakdown = { processing: 0, transport: 0, wait: 0, blocked: 0 };
        
        const processedParts = Object.values(this.parts).filter(p => p.state === 'FINISHED');
        const count = processedParts.length;
        
        if (count > 0) {
            const totalLead = processedParts.reduce((sum, p) => sum + (p.stats.processingTime + p.stats.transportTime + p.stats.waitTime + p.stats.blockedTime), 0);
            const totalProcess = processedParts.reduce((sum, p) => sum + p.stats.processingTime, 0);
            
            avgLeadTime = totalLead / count;
            avgFlowEfficiency = (totalProcess / totalLead) * 100;
            
            leadTimeBreakdown = {
                processing: totalProcess / count,
                transport: processedParts.reduce((s,p) => s + p.stats.transportTime, 0) / count,
                wait: processedParts.reduce((s,p) => s + p.stats.waitTime, 0) / count,
                blocked: processedParts.reduce((s,p) => s + p.stats.blockedTime, 0) / count
            };
        }
        
        const actualTaktTime = this.stats.partsProcessed > 0 ? (workingHoursTotal / this.stats.partsProcessed) : 0;
        let targetTaktTime = 0;
        if (this.settings.targetTakt && this.settings.targetTakt > 0) {
            targetTaktTime = parseFloat(this.settings.targetTakt) / 60.0;
        }

        let totalLaborCost = 0; 
        const ENERGY_COST_PER_H = 0.5; 
        let totalEnergyCost = 0;
        const workerStats = [];

        [...Object.values(this.workerPools), ...Object.values(this.toolPools)].forEach(pool => {
            const rate = pool.costPerHour || 0;
            const paidHours = workingHoursTotal * pool.capacity; 
            const attendanceCost = paidHours * rate;
            const hoursWorked = pool.totalBusyTimeSeconds / 3600;
            const utilizedCost = hoursWorked * rate;
            
            totalLaborCost += utilizedCost;
            
            workerStats.push({
                id: pool.name,
                type: pool.costPerHour > 0 ? 'Pracownik' : 'Narzędzie',
                capacity: pool.capacity,
                utilization: paidHours > 0 ? (hoursWorked / paidHours * 100).toFixed(2) : 0,
                hoursWorked: hoursWorked.toFixed(2),
                attendanceCost: attendanceCost.toFixed(2),
                utilizedCost: utilizedCost.toFixed(2)
            });
        });
        
        const stationStats = [];
        Object.keys(this.stationStates).forEach(stationId => {
            const state = this.stationStates[stationId];
            const stationDef = this.config.stations.find(s => s.id === stationId);
            const capacity = stationDef.capacity || 1;
            
            const totalCapacityTime = workingHoursTotal * capacity;
            const utilization = totalCapacityTime > 0 ? (state.totalBusyTime / totalCapacityTime) * 100 : 0;
            const starvation = totalCapacityTime > 0 ? (state.totalStarvedTime / totalCapacityTime) * 100 : 0;
            
            let mtbf = 0, mttr = 0;
            const breakdowns = state.breakdowns || [];
            const breakdownCount = breakdowns.length;
            const totalDowntime = breakdowns.reduce((sum, b) => sum + b.duration, 0);

            if (breakdownCount > 0) {
                mttr = totalDowntime / breakdownCount;
                mtbf = (totalCapacityTime - totalDowntime) / breakdownCount;
            }

            totalEnergyCost += state.totalBusyTime * ENERGY_COST_PER_H;

            let blocked = 100 - utilization - starvation - ((totalDowntime/totalCapacityTime)*100);
            if (blocked < 0) blocked = 0;

            stationStats.push({
                id: stationId,
                name: stationDef.name,
                utilization: utilization.toFixed(2),
                starvation: starvation.toFixed(2),
                blocked: blocked.toFixed(2),
                breakdownPct: totalCapacityTime > 0 ? ((totalDowntime / totalCapacityTime) * 100).toFixed(2) : 0,
                mtbf: mtbf.toFixed(1),
                mttr: mttr.toFixed(1),
                failures: breakdownCount,
                maxQueue: state.maxQueue
            });
        });
        stationStats.sort((a, b) => parseFloat(b.utilization) - parseFloat(a.utilization));

        const bufferStats = [];
        Object.keys(this.bufferStates).forEach(bufId => {
            const state = this.bufferStates[bufId];
            const bufDef = this.config.buffers.find(b => b.id === bufId);
            bufferStats.push({
                id: bufId,
                name: bufDef.name,
                maxQueue: state.maxQueue,
                capacity: bufDef.capacity,
                utilization: ((state.maxQueue / bufDef.capacity) * 100).toFixed(1)
            });
        });

        const detailedReports = this.calculateDetailedStats();

        const ordersWithDeadlines = detailedReports.orders.filter(o => o.status !== 'BEZ TERMINU');
        const onTimeOrders = ordersWithDeadlines.filter(o => o.onTime).length;
        const otif = ordersWithDeadlines.length > 0 ? (onTimeOrders / ordersWithDeadlines.length) * 100 : 100;

        const totalMaterialCostOfGoodParts = processedParts.reduce((sum, p) => sum + p.materialCost, 0);
        const totalProductionCost = totalLaborCost + totalEnergyCost + totalMaterialCostOfGoodParts;
        const cpu = count > 0 ? (totalProductionCost / count) : 0;
        
        const avgWipValue = this.stats.workInProcess.length > 0 
            ? (this.stats.workInProcess.reduce((s, w) => s + (w.value || 0), 0) / this.stats.workInProcess.length)
            : 0;

        const bottleneckFrequency = {};
        this.stats.bottleneckSnapshots.forEach(snap => {
             bottleneckFrequency[snap.stationId] = (bottleneckFrequency[snap.stationId] || 0) + 1;
        });
        const dynamicBottlenecks = Object.entries(bottleneckFrequency)
            .map(([id, freq]) => ({ 
                id, 
                name: this.config.stations.find(s => s.id === id)?.name || id, 
                hours: freq 
            }))
            .sort((a, b) => b.hours - a.hours);

        const results = {
            duration: duration,
            workingHoursTotal: workingHoursTotal,
            produced: this.stats.partsProcessed,
            scrapped: this.stats.partsScrapped,
            avgLeadTime: avgLeadTime,
            avgFlowEfficiency: avgFlowEfficiency,
            leadTimeBreakdown: leadTimeBreakdown,
            actualTakt: actualTaktTime, 
            targetTakt: targetTaktTime,
            otif: otif.toFixed(1),
            cpu: cpu.toFixed(2),
            avgWipValue: avgWipValue.toFixed(0),
            totalLaborCost: totalLaborCost,
            totalEnergyCost: totalEnergyCost,
            stationStats: stationStats,
            bufferStats: bufferStats,
            workerStats: workerStats,
            dynamicBottlenecks: dynamicBottlenecks,
            orderReports: detailedReports.orders,
            productReports: detailedReports.products,
            wipHistory: this.stats.workInProcess,
            replayEvents: this.replayEvents, 
            shiftSettings: this.settings.shifts 
        };

        this.logMessage(`Symulacja zakończona. Czas brutto: ${duration.toFixed(1)}h. OTIF: ${otif.toFixed(1)}%.`);
        self.postMessage({ type: 'SIMULATION_RESULTS', payload: results });
    }

    scheduleEvent(time, type, payload = {}) {
        this.eventQueue.push({ time, type, payload });
    }

    handleEvent(event) {
        switch(event.type) {
            case 'ORDER_ARRIVAL':
                this.handleOrderArrival(event.payload);
                break;
            case 'PART_ARRIVES_AT_NODE':
                this.handlePartArrivalAtNode(event.payload);
                break;
            case 'WORKER_ARRIVES_AT_STATION':
                this.handleWorkerArrives(event.payload);
                break;
            case 'OPERATION_COMPLETE':
                this.handleOperationComplete(event.payload);
                break;
            case 'TRANSPORT_COMPLETE':
                this.handleTransportComplete(event.payload);
                break;
            default:
                this.logMessage(`! Nieznane zdarzenie: ${event.type}`);
        }
    }
            
    // === HANDLERY ZDARZEŃ ===
    
    handleOrderArrival(payload) {
        const { order } = payload;
        this.orderMap[order.orderId] = order.orderString;
        
        try {
            const bom = this.parseOrderString(order.orderString, order.orderSize); 
            let stagger = 0;
            bom.forEach(parentBOM => {
                this.createAndSendPart(order, parentBOM, 'casings', order.dueDate, stagger);
                parentBOM.childrenBOM.forEach(childBOM => {
                    this.createAndSendPart(order, childBOM, 'functions', order.dueDate, stagger);
                });
                stagger += 0.05; 
            });
        } catch (e) {
            this.logMessage(`! BŁĄD ZLECENIA ${order.orderId}: ${e.message}`);
        }
    }
    
    handlePartArrivalAtNode(payload) {
        const { partId, nodeId } = payload;
        const part = this.parts[partId];
        if (!part) return;
        
        part.currentLocation = nodeId;

        const bufferNode = this.config.buffers.find(n => n.id === nodeId);
        if (bufferNode) {
            this.handleArrivalAtBuffer(part, bufferNode);
            return;
        }
        
        const stationNode = this.config.stations.find(n => n.id === nodeId);
        if (stationNode) {
            // Fix: Część dotarła do stacji, zwalniamy licznik "nadchodzących"
            if (this.stationStates[nodeId].incoming > 0) {
                this.stationStates[nodeId].incoming--;
            }
            this.handleArrivalAtStation(part, stationNode);
            return;
        }
    }
    
    handleArrivalAtBuffer(part, bufferNode) {
        part.updateState('IDLE_IN_BUFFER', this.simulationTime);
        
        const bufState = this.bufferStates[bufferNode.id];
        bufState.queue.push(part.id);
        
        if (bufState.queue.length > bufState.maxQueue) bufState.maxQueue = bufState.queue.length;
        bufState.sumQueue += bufState.queue.length;
        bufState.queueSamples++;
        
        this.recordBufferState(bufferNode.id, bufState.queue);

        if (bufferNode.isEndBuffer) {
            part.updateState('FINISHED', this.simulationTime);
            this.stats.partsProcessed++;
            this.stats.cycleTimes.push(this.simulationTime - part.creationTime);
            return;
        }
        
        this.tryPushFromBuffer(bufferNode.id);
        
        const montazFlow = this.config.flows.find(f => 
            f.from === bufferNode.id && 
            this.config.stations.find(s => s.id === f.to && s.type === 'montaz')
        );
        if (montazFlow) this.tryStartMontaz(montazFlow.to);
    }
    
    handleArrivalAtStation(part, stationNode) {
         part.updateState('IDLE_AT_STATION', this.simulationTime);
         
         const stationState = this.stationStates[stationNode.id];
         stationState.queue.push(part.id);
         
         if (stationState.queue.length > stationState.maxQueue) stationState.maxQueue = stationState.queue.length;
         stationState.sumQueue += stationState.queue.length;
         stationState.queueSamples++;

         this.tryStartOperation(stationNode.id);
     }
     
     handleWorkerArrives(payload) {
         const { partId, stationId, poolId, requiredOperators } = payload;
         const part = this.parts[partId];
         const stationNode = this.config.stations.find(s => s.id === stationId);
         const stationState = this.stationStates[stationId];

         part.updateState('PROCESSING', this.simulationTime);
         
         // Meta dane dla wizualizacji (Slot i Progress)
         const slotIndex = stationState.busySlots - 1;
         
         let baseTime = 0;
         switch (stationNode.type) {
             case 'podmontaz': 
             case 'montaz': { 
                 const operation = part.getNextOperation();
                 baseTime = operation ? (operation.time || 0) : 0;
                 break;
             }
             case 'jakosci':
             case 'pakowanie': {
                 const isQuality = stationNode.type === 'jakosci';
                 const settingsKey = isQuality ? 'qualitySettings' : 'packingSettings';
                 const ruleSet = this.settings[settingsKey];
                 if (!ruleSet || !ruleSet[part.size]) {
                     baseTime = 0;
                 } else {
                     const rule = ruleSet[part.size];
                     let totalTime = rule.baseTime || 0;
                     if (part.attachedChildren && part.attachedChildren.length > 0) {
                         part.attachedChildren.forEach(child => {
                             totalTime += (rule.functionTimes?.[child.code] || 0);
                         });
                     }
                     baseTime = totalTime;
                 }
                 break;
             }
             default: baseTime = 0.1;
         }

         let actualTime = baseTime;
         if (stationNode.variance && stationNode.variance > 0) {
             const variancePercent = stationNode.variance / 100;
             const randomFactor = 1 + (Math.random() * 2 - 1) * variancePercent;
             actualTime = baseTime * randomFactor;
         }

         if (stationNode.failureProb && stationNode.failureProb > 0) {
             const isFailure = Math.random() * 100 < stationNode.failureProb;
             if (isFailure) {
                 const repairTime = 1 + Math.random() * 2; 
                 actualTime += repairTime;
                 
                 if (!stationState.breakdowns) stationState.breakdowns = [];
                 stationState.breakdowns.push({ startTime: this.simulationTime, duration: repairTime });

                 this.logMessage(`! AWARIA na stacji [${stationNode.name}]. Naprawa: ${repairTime.toFixed(2)}h`);
                 this.recordStateChange(stationId, 'STOP', { reason: 'AWARIA_LOSOWA' });
             }
         }

         const completionTime = this.calculateCompletionTime(this.simulationTime, actualTime);
         const actualDuration = completionTime - this.simulationTime;

         // Rejestracja ze szczegółami dla Viewera
         this.recordStateChange(stationId, 'RUN', { 
             part: part.code, 
             order: part.orderId, 
             subCode: (part.code.includes('-') ? part.code.split('-').pop() : part.code), 
             isAssembled: part.attachedChildren.length > 0,
             startTime: this.simulationTime,
             endTime: completionTime,
             duration: actualDuration,
             slotIndex: slotIndex,
             totalOps: part.routing.length,
             currentOp: part.routingStep + 1
         });

         this.scheduleEvent(
             completionTime,
             'OPERATION_COMPLETE',
             { partId, stationId, poolId, requiredOperators, duration: actualTime }
         );
     }
     
     handleOperationComplete(payload) {
         const { partId, stationId, poolId, requiredOperators, duration } = payload;
         const part = this.parts[partId];
         const stationState = this.stationStates[stationId];
         const stationNode = this.config.stations.find(s => s.id === stationId);

         if (duration > 0) stationState.totalBusyTime += duration;
         stationState.busySlots--;
         this.recordStateChange(stationId, stationState.busySlots > 0 ? 'RUN' : 'IDLE');
         
         const workerPool = this.workerPools[poolId]; 
         
         if (workerPool && duration > 0) {
             this.recordResourceUsage(poolId, 'PROCESSING', partId, this.simulationTime - duration, this.simulationTime, { stationId });
         }

         if (workerPool) {
             const unblockedEntity = workerPool.release(part, requiredOperators, duration);
             if (unblockedEntity && unblockedEntity.state === 'WAITING_FOR_WORKER') {
                 this.tryStartOperation(unblockedEntity.currentLocation);
             }
         }
         
         if (stationNode.type === 'jakosci') {
             const baseScrapRate = 0.01; 
             const machineFactor = (stationNode.failureProb || 0) / 1000;
             if (Math.random() < (baseScrapRate + machineFactor)) {
                 this.logMessage(`X BRAK (SCRAP) części [${part.id}] na stacji ${stationNode.name}.`);
                 part.updateState('SCRAPPED', this.simulationTime);
                 this.stats.partsScrapped++;
                 // Fix: Nawet jak SCRAP, trzeba powiadomić bufory, że zwolniliśmy miejsce
                 this.notifyUpstreamBuffers(stationId);
                 return;
             }
         }

         part.routingStep++;
         
         const nextOp = part.getNextOperation();
         let canDoNext = false;
         if (nextOp) {
             if (stationNode.allowedOps && stationNode.allowedOps.length > 0) {
                 canDoNext = stationNode.allowedOps.some(op => op.id === nextOp.id);
             }
         }

         if (nextOp && canDoNext) {
             stationState.queue.unshift(part.id); 
             this.tryStartOperation(stationId);
             // Nie powiadamiamy upstream, bo slot nadal zajęty przez tę samą część (teoretycznie)
             // Właściwie, jeśli wraca do kolejki, to zwalnia slot procesowy, ale zajmuje miejsce w kolejce stacji.
             return;
         }
         
         // Zwalniamy slot, więc powiadamiamy bufory, że mogą pchać
         this.tryStartOperation(stationId);
         
         // !!! KLUCZOWY FIX: Sygnalizacja wsteczna !!!
         // Zwolniliśmy miejsce w kolejce stacji (bo wzięliśmy część do obróbki w tryStartOperation, 
         // LUB po prostu skończyliśmy i miejsce w ogólnym bilansie stacji się zwolniło).
         this.notifyUpstreamBuffers(stationId);

         if (stationNode.type === 'montaz') this.tryStartMontaz(stationId);

         const nextFlow = this.config.flows.find(f => f.from === stationId);
         if (nextFlow) {
             part.updateState('WAITING_FOR_TOOL', this.simulationTime);
             this.initiateTransport(part, stationId, nextFlow.to, 1);
         } else {
              if (part.state !== 'FINISHED' && part.state !== 'SCRAPPED') {
                  part.updateState('FINISHED', this.simulationTime);
                  this.stats.partsProcessed++;
              }
         }
     }

     handleTransportComplete(payload) {
        const { partId, toNodeId, poolId, requiredTools, startTime } = payload; 
        const part = this.parts[partId];
        const toolPool = this.toolPools[poolId];
        
        this.recordTransport(part, payload.fromNodeId, toNodeId, startTime, this.simulationTime);
        this.scheduleEvent(this.simulationTime, 'PART_ARRIVES_AT_NODE', { partId, nodeId: toNodeId });

        if (toolPool) {
            this.recordResourceUsage(poolId, 'TRANSPORT', partId, startTime, this.simulationTime);
            const unblockedEntity = toolPool.release(part, requiredTools, 0);
            if (unblockedEntity && unblockedEntity.state === 'WAITING_FOR_TOOL') {
                 const loc = unblockedEntity.currentLocation;
                 if (loc.startsWith('buf_')) this.tryPushFromBuffer(loc);
                 else if (loc.startsWith('sta_')) {
                     const nextFlow = this.config.flows.find(f => f.from === loc);
                     if (nextFlow) this.initiateTransport(unblockedEntity, loc, nextFlow.to, 1);
                 }
            }
        }
     }

    // === METODY POMOCNICZE ===
    
    // Fix: Nowa metoda do "budzenia" buforów, gdy stacja ma wolne miejsce
    notifyUpstreamBuffers(stationId) {
        const feedingFlows = this.config.flows.filter(f => f.to === stationId);
        feedingFlows.forEach(flow => {
            if (flow.from.startsWith('buf_')) {
                this.tryPushFromBuffer(flow.from);
            }
        });
    }

    tryStartOperation(stationId) {
        if (!this.isWorkingTime(this.simulationTime)) return;

        const stationState = this.stationStates[stationId];
        const stationNode = this.config.stations.find(s => s.id === stationId);

        if (stationState.queue.length === 0) return; 
        const maxCapacity = stationNode.capacity || 1;
        if (stationState.busySlots >= maxCapacity) return;

        const partId = stationState.queue[0];
        const part = this.parts[partId]; 
        
        let requiredOperators = 1; 
        
        if (stationNode.type === 'podmontaz' || stationNode.type === 'montaz') {
            const operation = part.getNextOperation();
            if (!operation) {
                 stationState.queue.shift();
                 this.handleOperationComplete({ partId: part.id, stationId: stationNode.id, poolId: null, requiredOperators: 0, duration: 0 });
                 return;
            }
            requiredOperators = operation.operators || 1;
        }

        const workerFlow = this.config.workerFlows.find(wf => wf.to === stationId);
        if (!workerFlow) { 
            // Stacja automatyczna (bez pracownika) lub błąd konfigu
            stationState.queue.shift(); 
            stationState.busySlots++;
            // Hack: reuse handlera bez pracownika
            this.handleWorkerArrives({ partId: part.id, stationId: stationId, poolId: null, requiredOperators: 0 });
            
            // Fix: Skoro wzięliśmy coś z kolejki, zwolniło się miejsce dla bufora
            this.notifyUpstreamBuffers(stationId);
            return; 
        }
        
        const workerPool = this.workerPools[workerFlow.from];
        // Fix: Twarde sprawdzenie ilości pracowników
        const workerGranted = workerPool.request(part, requiredOperators);
        
        if (workerGranted) {
            stationState.queue.shift(); 
            stationState.busySlots++;
            
            // Fix: Skoro wzięliśmy coś z kolejki, zwolniło się miejsce dla bufora
            this.notifyUpstreamBuffers(stationId);

            part.updateState('WAITING_FOR_WORKER_TRAVEL', this.simulationTime);

            const travelTime = (workerFlow.distance / workerPool.speed) / 3600; 
            const arrivalTime = this.calculateCompletionTime(this.simulationTime, travelTime);
            
            this.recordWorkerTravel(workerFlow.from, stationId, this.simulationTime, arrivalTime);

            this.scheduleEvent(
                arrivalTime,
                'WORKER_ARRIVES_AT_STATION',
                { partId: part.id, stationId: stationId, poolId: workerFlow.from, requiredOperators: requiredOperators }
            );
        } else {
            part.updateState('WAITING_FOR_WORKER', this.simulationTime);
        }
    }

    tryPushFromBuffer(bufferId) {
        if (!this.isWorkingTime(this.simulationTime)) return;

        const bufferState = this.bufferStates[bufferId];
        if (bufferState.queue.length === 0) return;
        
        const partId = bufferState.queue[0];
        const part = this.parts[partId];
        const nextOperation = part.getNextOperation();
        
        if (!nextOperation) return; 
        
        const targetStations = this.config.stations.filter(s => 
            s.allowedOps.some(op => op.id === nextOperation.id)
        );
        
        if (targetStations.length === 0) return;
        
        const targetStation = targetStations[0]; 
        const targetFlow = this.config.flows.find(f => f.from === bufferId && f.to === targetStation.id);
        
        if (!targetFlow) return;

        // !!! KLUCZOWY FIX: BLOKADA NIESKOŃCZONEGO BUFORA !!!
        // Sprawdzamy nie tylko fizyczną kolejkę (queue.length), ale też to co już jedzie (incoming).
        // Limit wejścia = Pojemność stacji (żeby działać w systemie ssącym/JIT) + mały margines (np. 2)
        const targetState = this.stationStates[targetStation.id];
        const capacity = targetStation.capacity || 1;
        const INPUT_LIMIT = capacity + 2; 

        if ((targetState.queue.length + targetState.incoming) >= INPUT_LIMIT) {
            // Stacja jest pełna (fizycznie lub wirtualnie przez transport). Czekamy.
            return;
        }
        
        bufferState.queue.shift();
        this.recordBufferState(bufferId, bufferState.queue);

        this.initiateTransport(part, bufferId, targetStation.id, 1);
    }
    
    tryStartMontaz(stationId) {
        if (!this.isWorkingTime(this.simulationTime)) return;

        const stationNode = this.config.stations.find(s => s.id === stationId);
        const stationState = this.stationStates[stationId];
        
        const maxCapacity = stationNode.capacity || 1;
        if (stationState.busySlots >= maxCapacity) return;
        if (stationState.queue.length > 0) { this.tryStartOperation(stationId); return; }
        
        const inputFlows = this.config.flows.filter(f => f.to === stationId);
        let parentPart = null;
        let parentBufferId = null;
        
        for (const flow of inputFlows) {
            const bufferState = this.bufferStates[flow.from];
            if (!bufferState) continue;
            const parentIndex = bufferState.queue.findIndex(partId => {
                const p = this.parts[partId];
                return p && p.type === 'PARENT' && p.getNextOperation() === null;
            });
            if (parentIndex !== -1) {
                parentPart = this.parts[bufferState.queue[parentIndex]];
                parentBufferId = flow.from;
                break;
            }
        }
        if (!parentPart) return; 

        const requiredChildren = parentPart.childrenBOM;
        let allChildrenAvailable = true;
        let consumedChildren = [];
        
        for (const childBOM of requiredChildren) {
            const productTypeId = `functions_${childBOM.size}_${childBOM.code}`;
            const connectedBufferIds = this.config.flows.filter(f => f.to === stationId).map(f => f.from);
            const targetBufferId = connectedBufferIds.find(bufId => {
                const buf = this.config.buffers.find(b => b.id === bufId);
                return buf && buf.allowedProductTypes && buf.allowedProductTypes.includes(productTypeId);
            });
            
            if (!targetBufferId) { allChildrenAvailable = false; break; }
            
            const childBufferState = this.bufferStates[targetBufferId];
            const childIndex = childBufferState.queue.findIndex(partId => {
                const p = this.parts[partId];
                return p && p.code === childBOM.code && p.size === childBOM.size && p.getNextOperation() === null;
            });
            
            if (childIndex === -1) { allChildrenAvailable = false; break; }
            
            consumedChildren.push({ partId: childBufferState.queue[childIndex], bufferId: targetBufferId, index: childIndex });
        }
        
        if (!allChildrenAvailable) return;
        
        consumedChildren.sort((a, b) => b.index - a.index); 
        consumedChildren.forEach(item => {
            const queue = this.bufferStates[item.bufferId].queue;
            queue.splice(item.index, 1); 
            this.recordBufferState(item.bufferId, queue);

            const childPart = this.parts[item.partId];
            parentPart.attachedChildren.push(childPart); 
            childPart.updateState('ASSEMBLED', this.simulationTime);
        });
        
        const parentQueue = this.bufferStates[parentBufferId].queue;
        const parentIndexInQueue = parentQueue.findIndex(id => id === parentPart.id);
        if (parentIndexInQueue !== -1) parentQueue.splice(parentIndexInQueue, 1);
        this.recordBufferState(parentBufferId, parentQueue);
        
        parentPart.currentLocation = stationId;
        stationState.queue.push(parentPart.id);
        
        let assemblyOps = [];
        const sequence = this.settings.assemblySequence || []; 
        const getMontazOps = (part) => {
             const typeKey = part.type === 'PARENT' ? 'casings' : 'functions';
             const routingKey = `${typeKey}_${part.size}_${part.code}_phase1`;
             return this.config.routings[routingKey] || [];
        };
        
        sequence.forEach(code => {
            if (parentPart.code === code) assemblyOps = assemblyOps.concat(getMontazOps(parentPart));
            const child = parentPart.attachedChildren.find(c => c.code === code);
            if (child) assemblyOps = assemblyOps.concat(getMontazOps(child));
        });
        
        if (assemblyOps.length === 0) {
             parentPart.attachedChildren.forEach(child => { assemblyOps = assemblyOps.concat(getMontazOps(child)); });
             assemblyOps = assemblyOps.concat(getMontazOps(parentPart));
        }

        parentPart.routing = assemblyOps;
        parentPart.routingStep = 0;
        
        this.tryStartOperation(stationId);
    }
    
    initiateTransport(part, fromNodeId, toNodeId, requiredTools) {
        const flow = this.config.flows.find(f => f.from === fromNodeId && f.to === toNodeId);
        if (!flow) return;

        // Fix: Jeśli cel to stacja, rezerwujemy wirtualne miejsce (incoming)
        if (this.config.stations.find(s => s.id === toNodeId)) {
            this.stationStates[toNodeId].incoming++;
        }

        const toolPoolId = this.config.toolPools.find(p => p.assignedFlows && p.assignedFlows.includes(flow.id))?.id;
        
        const startTime = this.simulationTime;

        if (!toolPoolId || !this.toolPools[toolPoolId]) {
            part.updateState('IN_TRANSPORT', this.simulationTime);
            const transportTime = (flow.distance / 1.0) / 3600; 
            const arrivalTime = this.calculateCompletionTime(this.simulationTime, transportTime);
            
            this.recordTransport(part, fromNodeId, toNodeId, startTime, arrivalTime);

            this.scheduleEvent(arrivalTime, 'PART_ARRIVES_AT_NODE', { partId: part.id, nodeId: toNodeId });
            return;
        }

        const toolPool = this.toolPools[toolPoolId];
        const toolGranted = toolPool.request(part, requiredTools);
        
        if (toolGranted) {
            part.updateState('IN_TRANSPORT', this.simulationTime);
            const transportTime = (flow.distance / toolPool.speed) / 3600; 
            const arrivalTime = this.calculateCompletionTime(this.simulationTime, transportTime);
            
            this.scheduleEvent(
                arrivalTime, 
                'TRANSPORT_COMPLETE', 
                { partId: part.id, toNodeId: toNodeId, poolId: toolPoolId, requiredTools: requiredTools, fromNodeId: fromNodeId, startTime: startTime }
            );
        } else {
            part.updateState('WAITING_FOR_TOOL', this.simulationTime);
        }
    }
    
    createAndSendPart(order, partBOM, typeKey, dueDate, delay = 0) {
        const routingKey = `${typeKey}_${partBOM.size}_${partBOM.code}_phase0`;
        const routing = this.config.routings[routingKey];
        const initialRouting = routing || [];
        
        const productTypeId = `${typeKey}_${partBOM.size}_${partBOM.code}`;
        const startBuffer = this.config.buffers.find(b => b.isStartBuffer && b.allowedProductTypes.includes(productTypeId));
        
        if (!startBuffer) return;
        
        this.partCounter++;
        const newPart = new Part(this.partCounter, order.orderId, partBOM.type, partBOM.code, partBOM.size, initialRouting, partBOM.childrenBOM, this.simulationTime + delay, dueDate);
        newPart.currentLocation = startBuffer.id;
        newPart.updateState('IDLE_IN_BUFFER', this.simulationTime + delay);

        this.parts[newPart.id] = newPart;
        this.scheduleEvent(this.simulationTime + delay, 'PART_ARRIVES_AT_NODE', { partId: newPart.id, nodeId: startBuffer.id });
    }

    parseOrderString(orderString, orderSize) {
        const parts = orderString.split('-');
        const orderBOM = [];
        let sectionCounter = 0;
        for (let i = 0; i < parts.length; i++) {
            const partCode = parts[i];
            if (partCode.startsWith('M')) {
                sectionCounter++;
                const parentPart = {
                    partId: `SEC${sectionCounter}_${partCode}`,
                    type: 'PARENT',
                    size: orderSize, 
                    code: partCode,
                    sectionId: sectionCounter,
                    childrenBOM: []
                };
                if (i + 1 < parts.length && !parts[i + 1].startsWith('M')) {
                    const childrenString = parts[i + 1];
                    for (const childCode of childrenString.split('')) {
                        parentPart.childrenBOM.push({
                            partId: `SEC${sectionCounter}_CHILD_${childCode}`,
                            type: 'CHILD',
                            size: orderSize, 
                            code: childCode
                        });
                    }
                    i++; 
                }
                orderBOM.push(parentPart);
            }
        }
        return orderBOM;
    }
    
    getHourDifference(startDateStr, endDateStr) {
        try {
            const parseDate = (str) => {
                const parts = str.split('-');
                if (parts[0].length === 2) return new Date(parts[2], parts[1] - 1, parts[0]);
                return new Date(parts[0], parts[1] - 1, parts[2]);
            };
            const start = parseDate(startDateStr);
            const end = parseDate(endDateStr);
            const diffMs = end - start;
            return (diffMs / (1000 * 60 * 60)); 
        } catch (e) { return 0; }
    }
}

// === KOMUNIKACJA Z WORKEREM ===
let engine;
self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (!engine) engine = new SimulationEngine();
    
    if (type === 'START_SIMULATION') {
        const { config, db, mrp, settings } = payload;
        const log = engine.runSimulation(config, db, mrp, settings); 
        self.postMessage({ type: 'SIMULATION_LOG', payload: log });
    }
};