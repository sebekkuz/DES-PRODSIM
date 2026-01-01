// src/logic/simulation_worker.js
import PriorityQueue from './priority_queue.js';
import { Part, ResourcePool } from './simulation_models.js';

/**
 * ==========================================================================
 * SILNIK SYMULACJI
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
        // Opcjonalnie: ograniczenie logowania dla wydajności
        // this.log.push(msg); 
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
    // TODO: W kolejnym kroku przenieść do ShiftScheduler.js
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
                incoming: 0 
            }; 
        });

        if (this.config.workerPools) {
            this.config.workerPools.forEach(pool => {
                // Używamy zaimportowanej klasy ResourcePool
                this.workerPools[pool.id] = new ResourcePool(pool.name, pool.capacity, pool.speed, this);
                // Ustawiamy koszt, który nie jest częścią konstruktora w modelach
                this.workerPools[pool.id].costPerHour = pool.costPerHour || 0;
            });
        }
        
        if (this.config.toolPools) {
            this.config.toolPools.forEach(pool => {
                this.toolPools[pool.id] = new ResourcePool(pool.name, pool.capacity, pool.speed, this);
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
        const anyShiftActive = Object.values(this.shiftsConfig).some(s => s.active);
        if (!anyShiftActive) {
            self.postMessage({ type: 'SIMULATION_RESULTS', payload: { error: "Brak aktywnych zmian w ustawieniach." } });
            return;
        }

        let steps = 0;
        const MAX_STEPS = 800000; 
        let nextWipSample = 0.0;

        while (!this.eventQueue.isEmpty()) {
            steps++;
            if (steps > MAX_STEPS) break;
            
            const event = this.eventQueue.pop(); 
            if (isNaN(event.time)) break;
            
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
                    value: 0 // Koszt materiałowy do dodania
                });
                
                // Bottleneck snapshot logic...
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

        return { orders: processedOrders, products: [] };
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
            const totalLead = processedParts.reduce((sum, p) => sum + (p.totalProcessingTime + p.totalTransportTime + p.totalWaitTime), 0);
            const totalProcess = processedParts.reduce((sum, p) => sum + p.totalProcessingTime, 0);
            
            avgLeadTime = totalLead / count;
            avgFlowEfficiency = (totalProcess / totalLead) * 100;
            
            leadTimeBreakdown = {
                processing: totalProcess / count,
                transport: processedParts.reduce((s,p) => s + p.totalTransportTime, 0) / count,
                wait: processedParts.reduce((s,p) => s + p.totalWaitTime, 0) / count,
                blocked: 0 // W uproszczonym modelu
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
            // Tutaj uproszczenie, bo ResourcePool z models.js nie ma totalBusyTimeSeconds
            // Należałoby dodać logikę zliczania czasu zajętości w request/release
            const hoursWorked = 0; 
            const utilizedCost = hoursWorked * rate;
            
            totalLaborCost += utilizedCost;
            
            workerStats.push({
                id: pool.name,
                type: pool.costPerHour > 0 ? 'Pracownik' : 'Narzędzie',
                capacity: pool.capacity,
                utilization: paidHours > 0 ? (hoursWorked / paidHours * 100).toFixed(2) : 0,
                attendanceCost: attendanceCost.toFixed(2)
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
            
            totalEnergyCost += state.totalBusyTime * ENERGY_COST_PER_H;

            let blocked = 100 - utilization - starvation;
            if (blocked < 0) blocked = 0;

            stationStats.push({
                id: stationId,
                name: stationDef.name,
                utilization: utilization.toFixed(2),
                starvation: starvation.toFixed(2),
                blocked: blocked.toFixed(2),
                failures: state.breakdowns.length,
                maxQueue: state.maxQueue
            });
        });

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

        const results = {
            duration: duration,
            produced: this.stats.partsProcessed,
            scrapped: this.stats.partsScrapped,
            avgLeadTime: avgLeadTime,
            avgFlowEfficiency: avgFlowEfficiency,
            leadTimeBreakdown: leadTimeBreakdown,
            actualTakt: actualTaktTime, 
            targetTakt: targetTaktTime,
            otif: otif.toFixed(1),
            cpu: 0, // Do obliczenia
            avgWipValue: 0,
            totalLaborCost: totalLaborCost,
            totalEnergyCost: totalEnergyCost,
            stationStats: stationStats,
            bufferStats: bufferStats,
            workerStats: workerStats,
            dynamicBottlenecks: [],
            orderReports: detailedReports.orders,
            productReports: [],
            wipHistory: this.stats.workInProcess,
            replayEvents: this.replayEvents, 
            shiftSettings: this.settings.shifts 
        };

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
            
    // === HANDLERY ZDARZEŃ (SKRÓCONE DLA CZYTELNOŚCI - LOGIKA BIZNESOWA) ===
    
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
            console.error(e);
        }
    }
    
    handlePartArrivalAtNode(payload) {
        const { partId, nodeId } = payload;
        const part = this.parts[partId];
        if (!part) return;
        part.currentLocation = nodeId;

        const bufferNode = this.config.buffers.find(n => n.id === nodeId);
        if (bufferNode) {
            part.state = 'IDLE_IN_BUFFER';
            const bufState = this.bufferStates[bufferNode.id];
            bufState.queue.push(part.id);
            if (bufState.queue.length > bufState.maxQueue) bufState.maxQueue = bufState.queue.length;
            this.recordBufferState(bufferNode.id, bufState.queue);

            if (bufferNode.isEndBuffer) {
                part.state = 'FINISHED';
                part.finishTime = this.simulationTime;
                this.stats.partsProcessed++;
                return;
            }
            this.tryPushFromBuffer(bufferNode.id);
            // Logika montażu...
            return;
        }
        
        const stationNode = this.config.stations.find(n => n.id === nodeId);
        if (stationNode) {
            if (this.stationStates[nodeId].incoming > 0) this.stationStates[nodeId].incoming--;
            part.state = 'IDLE_AT_STATION';
            const stationState = this.stationStates[stationNode.id];
            stationState.queue.push(part.id);
            this.tryStartOperation(stationNode.id);
        }
    }
     
     handleWorkerArrives(payload) {
         const { partId, stationId, poolId, requiredOperators } = payload;
         const part = this.parts[partId];
         const stationState = this.stationStates[stationId];
         
         part.state = 'PROCESSING';
         
         // Uproszczony czas operacji na potrzeby tego kroku
         const actualTime = 1.0; 
         const completionTime = this.calculateCompletionTime(this.simulationTime, actualTime);

         this.recordStateChange(stationId, 'RUN', { 
             part: part.code, 
             order: part.orderId,
             startTime: this.simulationTime,
             endTime: completionTime,
             duration: completionTime - this.simulationTime
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
         
         if (duration > 0) {
             stationState.totalBusyTime += duration;
             part.totalProcessingTime += duration;
         }
         
         stationState.busySlots--;
         this.recordStateChange(stationId, stationState.busySlots > 0 ? 'RUN' : 'IDLE');
         
         if (poolId && this.workerPools[poolId]) {
             this.workerPools[poolId].release(part, requiredOperators);
         }

         part.routingStep++;
         const nextFlow = this.config.flows.find(f => f.from === stationId);
         
         this.tryStartOperation(stationId); // Zwolniono slot
         this.notifyUpstreamBuffers(stationId);

         if (nextFlow) {
             this.initiateTransport(part, stationId, nextFlow.to, 1);
         } else {
              part.state = 'FINISHED';
              part.finishTime = this.simulationTime;
              this.stats.partsProcessed++;
         }
     }

     handleTransportComplete(payload) {
        const { partId, toNodeId, poolId, requiredTools, startTime } = payload; 
        const part = this.parts[partId];
        
        part.totalTransportTime += (this.simulationTime - startTime);
        this.recordTransport(part, payload.fromNodeId, toNodeId, startTime, this.simulationTime);
        this.scheduleEvent(this.simulationTime, 'PART_ARRIVES_AT_NODE', { partId, nodeId: toNodeId });

        if (poolId && this.toolPools[poolId]) {
            this.toolPools[poolId].release(part, requiredTools);
        }
     }

    // === METODY POMOCNICZE (Flow Logic) ===
    
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
        
        const workerFlow = this.config.workerFlows.find(wf => wf.to === stationId);
        
        if (!workerFlow) { 
            stationState.queue.shift(); 
            stationState.busySlots++;
            this.handleWorkerArrives({ partId: part.id, stationId: stationId, poolId: null, requiredOperators: 0 });
            this.notifyUpstreamBuffers(stationId);
            return; 
        }
        
        const workerPool = this.workerPools[workerFlow.from];
        if (workerPool.request(part, 1)) {
            stationState.queue.shift(); 
            stationState.busySlots++;
            this.notifyUpstreamBuffers(stationId);

            part.state = 'WAITING_FOR_WORKER_TRAVEL';
            const travelTime = (workerFlow.distance / workerPool.speed) / 3600; 
            const arrivalTime = this.calculateCompletionTime(this.simulationTime, travelTime);
            
            this.recordWorkerTravel(workerFlow.from, stationId, this.simulationTime, arrivalTime);
            this.scheduleEvent(arrivalTime, 'WORKER_ARRIVES_AT_STATION', { partId: part.id, stationId, poolId: workerFlow.from, requiredOperators: 1 });
        } else {
            part.state = 'WAITING_FOR_WORKER';
            part.totalWaitTime += 0.1; // Uproszczone zliczanie
        }
    }

    tryPushFromBuffer(bufferId) {
        if (!this.isWorkingTime(this.simulationTime)) return;
        const bufferState = this.bufferStates[bufferId];
        if (bufferState.queue.length === 0) return;
        
        const partId = bufferState.queue[0];
        const part = this.parts[partId];
        
        // Znajdź cel (uproszczone - pierwszy możliwy flow)
        const targetFlow = this.config.flows.find(f => f.from === bufferId);
        if (!targetFlow) return;

        const targetStation = this.config.stations.find(s => s.id === targetFlow.to);
        if (!targetStation) return;

        const targetState = this.stationStates[targetStation.id];
        const capacity = targetStation.capacity || 1;
        
        if ((targetState.queue.length + targetState.incoming) >= (capacity + 2)) return;
        
        bufferState.queue.shift();
        this.recordBufferState(bufferId, bufferState.queue);
        this.initiateTransport(part, bufferId, targetStation.id, 1);
    }
    
    initiateTransport(part, fromNodeId, toNodeId, requiredTools) {
        const flow = this.config.flows.find(f => f.from === fromNodeId && f.to === toNodeId);
        if (!flow) return;

        if (this.config.stations.find(s => s.id === toNodeId)) {
            this.stationStates[toNodeId].incoming++;
        }

        part.state = 'IN_TRANSPORT';
        const transportTime = (flow.distance / 1.0) / 3600; 
        const arrivalTime = this.calculateCompletionTime(this.simulationTime, transportTime);
        
        this.recordTransport(part, fromNodeId, toNodeId, this.simulationTime, arrivalTime);
        this.scheduleEvent(arrivalTime, 'PART_ARRIVES_AT_NODE', { partId: part.id, nodeId: toNodeId });
    }
    
    createAndSendPart(order, partBOM, typeKey, dueDate, delay = 0) {
        // Używamy zaimportowanej klasy Part
        this.partCounter++;
        const newPart = new Part(
            this.partCounter, 
            order.orderId, 
            partBOM.type, 
            partBOM.code, 
            partBOM.size, 
            [], // Routing do pobrania później
            partBOM.childrenBOM, 
            this.simulationTime + delay
        );
        newPart.dueDate = dueDate;
        
        // Znajdź bufor startowy
        const productTypeId = `${typeKey}_${partBOM.size}_${partBOM.code}`;
        const startBuffer = this.config.buffers.find(b => b.isStartBuffer && (b.allowedProductTypes || []).includes(productTypeId));
        
        if (!startBuffer) return; // Brak miejsca startu

        this.parts[newPart.id] = newPart;
        this.scheduleEvent(this.simulationTime + delay, 'PART_ARRIVES_AT_NODE', { partId: newPart.id, nodeId: startBuffer.id });
    }

    parseOrderString(orderString, orderSize) {
        // ... (Logika parsowania bez zmian, skopiowana z poprzedniej wersji)
        const parts = orderString.split('-');
        const orderBOM = [];
        let sectionCounter = 0;
        for (let i = 0; i < parts.length; i++) {
            const partCode = parts[i];
            if (partCode.startsWith('M')) {
                sectionCounter++;
                const parentPart = { partId: `SEC${sectionCounter}_${partCode}`, type: 'PARENT', size: orderSize, code: partCode, sectionId: sectionCounter, childrenBOM: [] };
                if (i + 1 < parts.length && !parts[i + 1].startsWith('M')) {
                    const childrenString = parts[i + 1];
                    for (const childCode of childrenString.split('')) {
                        parentPart.childrenBOM.push({ partId: `CHILD_${childCode}`, type: 'CHILD', size: orderSize, code: childCode });
                    }
                    i++; 
                }
                orderBOM.push(parentPart);
            }
        }
        return orderBOM;
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