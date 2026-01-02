// src/logic/SimulationEventHandler.js
'use strict';

import { Part } from './simulation_models.js';

// Ustaw na false, jeśli konsola będzie zbyt zaśmiecona
const DEBUG_ROUTING = true;

export class SimulationEventHandler {
    constructor(engine) {
        this.engine = engine;
        // Licznik do sprawiedliwego rozdziału zadań (Round-Robin)
        this.roundRobinCounter = 0;
        
        // TEST CZY KOD SIĘ ZAŁADOWAŁ
        console.error(">>> NOWA LOGIKA SYMULACJI ZAŁADOWANA (Round-Robin) <<<");
    }

    handleEvent(event) {
        switch(event.type) {
            case 'ORDER_ARRIVAL': this.handleOrderArrival(event.payload); break;
            case 'PART_ARRIVES_AT_NODE': this.handlePartArrivalAtNode(event.payload); break;
            case 'WORKER_ARRIVES_AT_STATION': this.handleWorkerArrives(event.payload); break;
            case 'OPERATION_COMPLETE': this.handleOperationComplete(event.payload); break;
            case 'TRANSPORT_COMPLETE': this.handleTransportComplete(event.payload); break;
            default: this.engine.logMessage(`! Nieznane zdarzenie: ${event.type}`);
        }
    }

    // --- HANDLERY ---

    handleOrderArrival(payload) {
        const { order } = payload;
        this.engine.orderMap[order.orderId] = order.orderString;
        try {
            const bom = this.parseOrderString(order.orderString, order.orderSize); 
            let stagger = 0;
            bom.forEach(parentBOM => {
                this.createAndSendPart(order, parentBOM, 'casings', order.dueDate, stagger);
                parentBOM.childrenBOM.forEach(childBOM => {
                    this.createAndSendPart(order, childBOM, 'functions', order.dueDate, stagger);
                });
                stagger += 0.005; 
            });
        } catch (e) {
            this.engine.logMessage(`! BŁĄD ZLECENIA: ${e.message}`);
        }
    }

    handlePartArrivalAtNode(payload) {
        const { partId, nodeId } = payload;
        const part = this.engine.parts[partId];
        if (!part) return;
        
        part.currentLocation = nodeId;

        const bufferNode = this.engine.config.buffers.find(n => n.id === nodeId);
        if (bufferNode) {
            this.handleArrivalAtBuffer(part, bufferNode);
        } else {
            const stationNode = this.engine.config.stations.find(n => n.id === nodeId);
            if (stationNode) {
                if (this.engine.stationStates[nodeId] && this.engine.stationStates[nodeId].incoming > 0) {
                    this.engine.stationStates[nodeId].incoming--;
                }
                this.handleArrivalAtStation(part, stationNode);
            }
        }
    }

    handleArrivalAtBuffer(part, bufferNode) {
        part.updateState('IDLE_IN_BUFFER', this.engine.simulationTime);
        const bufState = this.engine.bufferStates[bufferNode.id];
        bufState.queue.push(part.id);
        
        if (bufState.queue.length > bufState.maxQueue) bufState.maxQueue = bufState.queue.length;
        bufState.sumQueue += bufState.queue.length;
        bufState.queueSamples++;
        this.engine.recordBufferState(bufferNode.id, bufState.queue);

        if (bufferNode.isEndBuffer) {
            part.updateState('FINISHED', this.engine.simulationTime);
            this.engine.stats.partsProcessed++;
            this.engine.stats.cycleTimes.push(this.engine.simulationTime - part.creationTime);
            return;
        }
        
        this.tryPushFromBuffer(bufferNode.id);
        
        const montazFlow = this.engine.config.flows.find(f => f.from === bufferNode.id && this.engine.config.stations.find(s => s.id === f.to && s.type === 'montaz'));
        if (montazFlow) this.tryStartMontaz(montazFlow.to);
    }

    handleArrivalAtStation(part, stationNode) {
         part.updateState('IDLE_AT_STATION', this.engine.simulationTime);
         const stationState = this.engine.stationStates[stationNode.id];
         stationState.queue.push(part.id);
         
         if (stationState.queue.length > stationState.maxQueue) stationState.maxQueue = stationState.queue.length;
         stationState.sumQueue += stationState.queue.length;
         stationState.queueSamples++;

         this.tryStartOperation(stationNode.id);
    }

    handleWorkerArrives(payload) {
         const { partId, stationId, poolId, requiredOperators } = payload;
         const part = this.engine.parts[partId];
         const stationNode = this.engine.config.stations.find(s => s.id === stationId);
         const stationState = this.engine.stationStates[stationId];

         part.updateState('PROCESSING', this.engine.simulationTime);
         
         let baseTime = 0.1;
         const operation = part.getNextOperation();
         if (operation && operation.time) baseTime = operation.time;

         let actualTime = baseTime;
         if (stationNode.variance) actualTime *= (1 + (Math.random() * 2 - 1) * (stationNode.variance / 100));
         
         const completionTime = this.engine.scheduler.calculateCompletionTime(this.engine.simulationTime, actualTime);
         const actualDuration = completionTime - this.engine.simulationTime;

         this.engine.recordStateChange(stationId, 'RUN', { 
             part: part.code, 
             order: part.orderId, 
             startTime: this.engine.simulationTime,
             endTime: completionTime,
             duration: actualDuration,
             slotIndex: stationState.busySlots - 1
         });

         this.engine.scheduleEvent(completionTime, 'OPERATION_COMPLETE', { partId, stationId, poolId, requiredOperators, duration: actualTime });
    }

    handleOperationComplete(payload) {
         const { partId, stationId, poolId, requiredOperators, duration } = payload;
         const part = this.engine.parts[partId];
         const stationState = this.engine.stationStates[stationId];
         const stationNode = this.engine.config.stations.find(s => s.id === stationId);

         if (duration > 0) stationState.totalBusyTime += duration;
         stationState.busySlots--;
         this.engine.recordStateChange(stationId, stationState.busySlots > 0 ? 'RUN' : 'IDLE');
         
         if (poolId && this.engine.workerPools[poolId]) {
             this.engine.recordResourceUsage(poolId, 'PROCESSING', partId, this.engine.simulationTime - duration, this.engine.simulationTime, { stationId });
             const unblocked = this.engine.workerPools[poolId].release(part, requiredOperators, duration);
             if (unblocked && unblocked.state === 'WAITING_FOR_WORKER') this.tryStartOperation(unblocked.currentLocation);
         }

         part.routingStep++;
         const nextOp = part.getNextOperation();
         
         if (nextOp && this.isStationCapable(stationNode, nextOp)) {
             stationState.queue.unshift(part.id); 
             this.tryStartOperation(stationId);
             return;
         }
         
         this.tryStartOperation(stationId);
         this.notifyUpstreamBuffers(stationId);

         const nextFlow = this.engine.config.flows.find(f => f.from === stationId);
         if (nextFlow) {
             part.updateState('WAITING_FOR_TOOL', this.engine.simulationTime);
             this.initiateTransport(part, stationId, nextFlow.to, 1);
         } else {
              if (part.state !== 'FINISHED') {
                  part.updateState('FINISHED', this.engine.simulationTime);
                  this.engine.stats.partsProcessed++;
              }
         }
    }

    handleTransportComplete(payload) {
        const { partId, toNodeId, poolId, requiredTools, startTime } = payload; 
        const part = this.engine.parts[partId];
        const toolPool = this.engine.toolPools[poolId];
        
        this.engine.recordTransport(part, payload.fromNodeId, toNodeId, startTime, this.engine.simulationTime);
        this.engine.scheduleEvent(this.engine.simulationTime, 'PART_ARRIVES_AT_NODE', { partId, nodeId: toNodeId });

        if (toolPool) {
            this.engine.recordResourceUsage(poolId, 'TRANSPORT', partId, startTime, this.engine.simulationTime);
            const unblocked = toolPool.release(part, requiredTools, 0);
            if (unblocked && unblocked.currentLocation.startsWith('buf_')) {
                 this.tryPushFromBuffer(unblocked.currentLocation);
            }
        }
    }

    // --- HELPERY LOGICZNE ---

    isStationCapable(station, operation) {
        if (!station.allowedOps || station.allowedOps.length === 0) return true;
        return station.allowedOps.some(op => op.id === operation.id);
    }

    notifyUpstreamBuffers(stationId) {
        const feedingFlows = this.engine.config.flows.filter(f => f.to === stationId);
        feedingFlows.forEach(flow => {
            if (flow.from.startsWith('buf_')) {
                this.tryPushFromBuffer(flow.from);
            }
        });
    }

    tryStartOperation(stationId) {
        if (!this.engine.scheduler.isWorkingTime(this.engine.simulationTime)) return;

        const stationState = this.engine.stationStates[stationId];
        const stationNode = this.engine.config.stations.find(s => s.id === stationId);

        if (stationState.queue.length === 0) return; 
        const capacity = Number(stationNode.capacity) || 1;
        if (stationState.busySlots >= capacity) return;

        const partId = stationState.queue[0];
        const part = this.engine.parts[partId]; 
        
        const operation = part.getNextOperation();
        let requiredOperators = 1; 
        if (operation) requiredOperators = operation.operators || 1;

        const workerFlow = this.engine.config.workerFlows.find(wf => wf.to === stationId);
        
        if (!workerFlow || requiredOperators === 0) {
            stationState.queue.shift(); 
            stationState.busySlots++;
            this.handleWorkerArrives({ partId: part.id, stationId: stationId, poolId: null, requiredOperators: 0 });
            this.notifyUpstreamBuffers(stationId);
            return; 
        }
        
        const workerPool = this.engine.workerPools[workerFlow.from];
        if (workerPool.request(part, requiredOperators)) {
            stationState.queue.shift(); 
            stationState.busySlots++;
            this.notifyUpstreamBuffers(stationId);

            part.updateState('WAITING_FOR_WORKER_TRAVEL', this.engine.simulationTime);
            const travelTime = (workerFlow.distance / workerPool.speed) / 3600; 
            const arrivalTime = this.engine.scheduler.calculateCompletionTime(this.engine.simulationTime, travelTime);
            this.engine.recordWorkerTravel(workerFlow.from, stationId, this.engine.simulationTime, arrivalTime);
            this.engine.scheduleEvent(arrivalTime, 'WORKER_ARRIVES_AT_STATION', { partId: part.id, stationId, poolId: workerFlow.from, requiredOperators });
        } else {
            part.updateState('WAITING_FOR_WORKER', this.engine.simulationTime);
        }
    }

    // === ROUTER Z LOGIKĄ ROUND-ROBIN ===
    tryPushFromBuffer(bufferId) {
        if (!this.engine.scheduler.isWorkingTime(this.engine.simulationTime)) return;

        const bufferState = this.engine.bufferStates[bufferId];
        let loopLimit = 100;

        // Pętla opróżniająca bufor
        while (bufferState.queue.length > 0 && loopLimit > 0) {
            loopLimit--;
            const partId = bufferState.queue[0];
            const part = this.engine.parts[partId];
            const nextOp = part.getNextOperation();
            
            if (!nextOp) { 
                bufferState.queue.shift(); 
                continue; 
            }

            // 1. Znajdź połączenia
            const outgoingFlows = this.engine.config.flows.filter(f => f.from === bufferId);
            if (outgoingFlows.length === 0) break;

            const candidates = [];
            
            for (const flow of outgoingFlows) {
                const station = this.engine.config.stations.find(s => s.id === flow.to);
                if (!station) continue;

                if (!this.isStationCapable(station, nextOp)) continue;

                const stState = this.engine.stationStates[station.id];
                const capacity = Number(station.capacity) || 1;
                const inputLimit = capacity * 20; 
                const currentLoad = stState.queue.length + stState.incoming;

                // Score: 
                // Busy = 1000 pkt
                // Load = 1 pkt
                const busyPenalty = (stState.busySlots >= capacity) ? 1000 : 0;
                const score = busyPenalty + currentLoad;

                if (currentLoad < inputLimit) {
                    candidates.push({ station, flow, score });
                }
            }

            if (candidates.length === 0) break;

            // 2. Sortowanie po wyniku (najmniejszy wygrywa)
            candidates.sort((a, b) => a.score - b.score);

            // 3. Round-Robin dla remisów (najlepszy wynik ma ten sam score co drugi?)
            const bestScore = candidates[0].score;
            const topCandidates = candidates.filter(c => c.score === bestScore);
            
            let chosen = topCandidates[0];
            if (topCandidates.length > 1) {
                // Wybieramy z listy topCandidates cyklicznie
                const index = this.roundRobinCounter % topCandidates.length;
                chosen = topCandidates[index];
                this.roundRobinCounter++;
            }

            if (DEBUG_ROUTING) {
                console.log(`[ROUTING] ${partId} -> ${chosen.station.id} (Score: ${chosen.score}, RR-Index: ${this.roundRobinCounter})`);
            }

            // 4. Egzekucja
            bufferState.queue.shift();
            this.engine.recordBufferState(bufferId, bufferState.queue);
            
            // Rezerwuj slot incoming
            this.engine.stationStates[chosen.station.id].incoming++; 
            
            // Transport
            this.initiateTransport(part, bufferId, chosen.station.id, 1, true);
        }
    }

    initiateTransport(part, fromNodeId, toNodeId, requiredTools, skipIncomingIncrement = false) {
        const flow = this.engine.config.flows.find(f => f.from === fromNodeId && f.to === toNodeId);
        if (!flow) return;

        if (!skipIncomingIncrement) {
            const st = this.engine.config.stations.find(s => s.id === toNodeId);
            if(st && this.engine.stationStates[toNodeId]) {
                this.engine.stationStates[toNodeId].incoming++;
            }
        }

        const startTime = this.engine.simulationTime;
        const transportTime = 0.001; 
        const arrivalTime = startTime + transportTime;
        
        part.updateState('IN_TRANSPORT', startTime);
        this.engine.recordTransport(part, fromNodeId, toNodeId, startTime, arrivalTime);
        this.engine.scheduleEvent(arrivalTime, 'PART_ARRIVES_AT_NODE', { partId: part.id, nodeId: toNodeId });
    }

    // Reszta bez zmian
    createAndSendPart(order, partBOM, typeKey, dueDate, delay) {
        const productTypeId = `${typeKey}_${partBOM.size}_${partBOM.code}`;
        const startBuffer = this.engine.config.buffers.find(b => b.isStartBuffer && b.allowedProductTypes.includes(productTypeId));
        if (!startBuffer) return;
        this.engine.partCounter++;
        const routingKey = `${typeKey}_${partBOM.size}_${partBOM.code}_phase0`;
        const routing = this.engine.config.routings[routingKey] || [];
        const newPart = new Part(this.engine.partCounter, order.orderId, partBOM.type, partBOM.code, partBOM.size, routing, partBOM.childrenBOM, this.engine.simulationTime + delay);
        newPart.dueDate = dueDate; newPart.currentLocation = startBuffer.id;
        newPart.updateState('IDLE_IN_BUFFER', this.engine.simulationTime + delay);
        this.engine.parts[newPart.id] = newPart;
        this.engine.scheduleEvent(this.engine.simulationTime + delay, 'PART_ARRIVES_AT_NODE', { partId: newPart.id, nodeId: startBuffer.id });
    }

    parseOrderString(orderString, orderSize) {
        const parts = orderString.split('-'); const orderBOM = []; let sectionCounter = 0;
        for (let i = 0; i < parts.length; i++) {
            const partCode = parts[i];
            if (partCode.startsWith('M')) {
                sectionCounter++;
                const parentPart = { partId: `SEC${sectionCounter}_${partCode}`, type: 'PARENT', size: orderSize, code: partCode, sectionId: sectionCounter, childrenBOM: [] };
                if (i + 1 < parts.length && !parts[i + 1].startsWith('M')) {
                    const childrenString = parts[i + 1];
                    for (const childCode of childrenString.split('')) {
                        parentPart.childrenBOM.push({ partId: `SEC${sectionCounter}_CHILD_${childCode}`, type: 'CHILD', size: orderSize, code: childCode });
                    }
                    i++; 
                }
                orderBOM.push(parentPart);
            }
        }
        return orderBOM;
    }
    
    tryStartMontaz(stationId) { }
}