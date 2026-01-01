// src/logic/SimulationEventHandler.js
'use strict';

import { Part } from './simulation_models.js';

export class SimulationEventHandler {
    constructor(engine) {
        this.engine = engine;
    }

    // === GŁÓWNY ROUTER ZDARZEŃ ===
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
                this.engine.logMessage(`! Nieznane zdarzenie: ${event.type}`);
        }
    }

    // === OBSŁUGA KONKRETNYCH ZDARZEŃ ===

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
                stagger += 0.05; 
            });
        } catch (e) {
            this.engine.logMessage(`! BŁĄD ZLECENIA ${order.orderId}: ${e.message}`);
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
            return;
        }
        
        const stationNode = this.engine.config.stations.find(n => n.id === nodeId);
        if (stationNode) {
            if (this.engine.stationStates[nodeId].incoming > 0) {
                this.engine.stationStates[nodeId].incoming--;
            }
            this.handleArrivalAtStation(part, stationNode);
            return;
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
        
        const montazFlow = this.engine.config.flows.find(f => 
            f.from === bufferNode.id && 
            this.engine.config.stations.find(s => s.id === f.to && s.type === 'montaz')
        );
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
         const slotIndex = stationState.busySlots - 1;
         
         // Obliczanie czasu operacji
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
                 const ruleSet = this.engine.settings[settingsKey];
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
         // Wariancja
         if (stationNode.variance && stationNode.variance > 0) {
             const variancePercent = stationNode.variance / 100;
             const randomFactor = 1 + (Math.random() * 2 - 1) * variancePercent;
             actualTime = baseTime * randomFactor;
         }

         // Awarie
         if (stationNode.failureProb && stationNode.failureProb > 0) {
             const isFailure = Math.random() * 100 < stationNode.failureProb;
             if (isFailure) {
                 const repairTime = 1 + Math.random() * 2; 
                 actualTime += repairTime;
                 if (!stationState.breakdowns) stationState.breakdowns = [];
                 stationState.breakdowns.push({ startTime: this.engine.simulationTime, duration: repairTime });
                 this.engine.recordStateChange(stationId, 'STOP', { reason: 'AWARIA_LOSOWA' });
             }
         }

         // Obliczenie końca z uwzględnieniem zmian (Scheduler)
         const completionTime = this.engine.scheduler.calculateCompletionTime(this.engine.simulationTime, actualTime);
         const actualDuration = completionTime - this.engine.simulationTime;

         this.engine.recordStateChange(stationId, 'RUN', { 
             part: part.code, 
             order: part.orderId, 
             subCode: (part.code.includes('-') ? part.code.split('-').pop() : part.code), 
             isAssembled: part.attachedChildren.length > 0,
             startTime: this.engine.simulationTime,
             endTime: completionTime,
             duration: actualDuration,
             slotIndex: slotIndex,
             totalOps: part.routing.length,
             currentOp: part.routingStep + 1
         });

         this.engine.scheduleEvent(
             completionTime,
             'OPERATION_COMPLETE',
             { partId, stationId, poolId, requiredOperators, duration: actualTime }
         );
    }

    handleOperationComplete(payload) {
         const { partId, stationId, poolId, requiredOperators, duration } = payload;
         const part = this.engine.parts[partId];
         const stationState = this.engine.stationStates[stationId];
         const stationNode = this.engine.config.stations.find(s => s.id === stationId);

         if (duration > 0) stationState.totalBusyTime += duration;
         stationState.busySlots--;
         this.engine.recordStateChange(stationId, stationState.busySlots > 0 ? 'RUN' : 'IDLE');
         
         const workerPool = this.engine.workerPools[poolId]; 
         
         if (workerPool && duration > 0) {
             this.engine.recordResourceUsage(poolId, 'PROCESSING', partId, this.engine.simulationTime - duration, this.engine.simulationTime, { stationId });
         }

         if (workerPool) {
             const unblockedEntity = workerPool.release(part, requiredOperators, duration);
             if (unblockedEntity && unblockedEntity.state === 'WAITING_FOR_WORKER') {
                 this.tryStartOperation(unblockedEntity.currentLocation);
             }
         }
         
         // Kontrola Jakości (Scrap)
         if (stationNode.type === 'jakosci') {
             const baseScrapRate = 0.01; 
             const machineFactor = (stationNode.failureProb || 0) / 1000;
             if (Math.random() < (baseScrapRate + machineFactor)) {
                 part.updateState('SCRAPPED', this.engine.simulationTime);
                 this.engine.stats.partsScrapped++;
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
             return;
         }
         
         this.tryStartOperation(stationId);
         this.notifyUpstreamBuffers(stationId);

         if (stationNode.type === 'montaz') this.tryStartMontaz(stationId);

         const nextFlow = this.engine.config.flows.find(f => f.from === stationId);
         if (nextFlow) {
             part.updateState('WAITING_FOR_TOOL', this.engine.simulationTime);
             this.initiateTransport(part, stationId, nextFlow.to, 1);
         } else {
              if (part.state !== 'FINISHED' && part.state !== 'SCRAPPED') {
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
            const unblockedEntity = toolPool.release(part, requiredTools, 0);
            if (unblockedEntity && unblockedEntity.state === 'WAITING_FOR_TOOL') {
                 const loc = unblockedEntity.currentLocation;
                 if (loc.startsWith('buf_')) this.tryPushFromBuffer(loc);
                 else if (loc.startsWith('sta_')) {
                     const nextFlow = this.engine.config.flows.find(f => f.from === loc);
                     if (nextFlow) this.initiateTransport(unblockedEntity, loc, nextFlow.to, 1);
                 }
            }
        }
    }

    // === METODY LOGICZNE (Helpers) ===

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
        const maxCapacity = stationNode.capacity || 1;
        if (stationState.busySlots >= maxCapacity) return;

        const partId = stationState.queue[0];
        const part = this.engine.parts[partId]; 
        
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

        const workerFlow = this.engine.config.workerFlows.find(wf => wf.to === stationId);
        
        if (!workerFlow) { 
            stationState.queue.shift(); 
            stationState.busySlots++;
            this.handleWorkerArrives({ partId: part.id, stationId: stationId, poolId: null, requiredOperators: 0 });
            this.notifyUpstreamBuffers(stationId);
            return; 
        }
        
        const workerPool = this.engine.workerPools[workerFlow.from];
        const workerGranted = workerPool.request(part, requiredOperators);
        
        if (workerGranted) {
            stationState.queue.shift(); 
            stationState.busySlots++;
            this.notifyUpstreamBuffers(stationId);

            part.updateState('WAITING_FOR_WORKER_TRAVEL', this.engine.simulationTime);

            const travelTime = (workerFlow.distance / workerPool.speed) / 3600; 
            const arrivalTime = this.engine.scheduler.calculateCompletionTime(this.engine.simulationTime, travelTime);
            
            this.engine.recordWorkerTravel(workerFlow.from, stationId, this.engine.simulationTime, arrivalTime);

            this.engine.scheduleEvent(
                arrivalTime,
                'WORKER_ARRIVES_AT_STATION',
                { partId: part.id, stationId: stationId, poolId: workerFlow.from, requiredOperators: requiredOperators }
            );
        } else {
            part.updateState('WAITING_FOR_WORKER', this.engine.simulationTime);
        }
    }

    tryPushFromBuffer(bufferId) {
        if (!this.engine.scheduler.isWorkingTime(this.engine.simulationTime)) return;

        const bufferState = this.engine.bufferStates[bufferId];
        if (bufferState.queue.length === 0) return;
        
        const partId = bufferState.queue[0];
        const part = this.engine.parts[partId];
        const nextOperation = part.getNextOperation();
        
        if (!nextOperation) return; 
        
        const targetStations = this.engine.config.stations.filter(s => 
            s.allowedOps.some(op => op.id === nextOperation.id)
        );
        
        if (targetStations.length === 0) return;
        
        const targetStation = targetStations[0]; 
        const targetFlow = this.engine.config.flows.find(f => f.from === bufferId && f.to === targetStation.id);
        
        if (!targetFlow) return;

        const targetState = this.engine.stationStates[targetStation.id];
        const capacity = targetStation.capacity || 1;
        const INPUT_LIMIT = capacity + 2; 

        if ((targetState.queue.length + targetState.incoming) >= INPUT_LIMIT) {
            return;
        }
        
        bufferState.queue.shift();
        this.engine.recordBufferState(bufferId, bufferState.queue);

        this.initiateTransport(part, bufferId, targetStation.id, 1);
    }

    tryStartMontaz(stationId) {
        if (!this.engine.scheduler.isWorkingTime(this.engine.simulationTime)) return;

        const stationNode = this.engine.config.stations.find(s => s.id === stationId);
        const stationState = this.engine.stationStates[stationId];
        
        const maxCapacity = stationNode.capacity || 1;
        if (stationState.busySlots >= maxCapacity) return;
        if (stationState.queue.length > 0) { this.tryStartOperation(stationId); return; }
        
        const inputFlows = this.engine.config.flows.filter(f => f.to === stationId);
        let parentPart = null;
        let parentBufferId = null;
        
        for (const flow of inputFlows) {
            const bufferState = this.engine.bufferStates[flow.from];
            if (!bufferState) continue;
            const parentIndex = bufferState.queue.findIndex(partId => {
                const p = this.engine.parts[partId];
                return p && p.type === 'PARENT' && p.getNextOperation() === null;
            });
            if (parentIndex !== -1) {
                parentPart = this.engine.parts[bufferState.queue[parentIndex]];
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
            const connectedBufferIds = this.engine.config.flows.filter(f => f.to === stationId).map(f => f.from);
            const targetBufferId = connectedBufferIds.find(bufId => {
                const buf = this.engine.config.buffers.find(b => b.id === bufId);
                return buf && buf.allowedProductTypes && buf.allowedProductTypes.includes(productTypeId);
            });
            
            if (!targetBufferId) { allChildrenAvailable = false; break; }
            
            const childBufferState = this.engine.bufferStates[targetBufferId];
            const childIndex = childBufferState.queue.findIndex(partId => {
                const p = this.engine.parts[partId];
                return p && p.code === childBOM.code && p.size === childBOM.size && p.getNextOperation() === null;
            });
            
            if (childIndex === -1) { allChildrenAvailable = false; break; }
            
            consumedChildren.push({ partId: childBufferState.queue[childIndex], bufferId: targetBufferId, index: childIndex });
        }
        
        if (!allChildrenAvailable) return;
        
        consumedChildren.sort((a, b) => b.index - a.index); 
        consumedChildren.forEach(item => {
            const queue = this.engine.bufferStates[item.bufferId].queue;
            queue.splice(item.index, 1); 
            this.engine.recordBufferState(item.bufferId, queue);

            const childPart = this.engine.parts[item.partId];
            parentPart.attachedChildren.push(childPart); 
            childPart.updateState('ASSEMBLED', this.engine.simulationTime);
        });
        
        const parentQueue = this.engine.bufferStates[parentBufferId].queue;
        const parentIndexInQueue = parentQueue.findIndex(id => id === parentPart.id);
        if (parentIndexInQueue !== -1) parentQueue.splice(parentIndexInQueue, 1);
        this.engine.recordBufferState(parentBufferId, parentQueue);
        
        parentPart.currentLocation = stationId;
        stationState.queue.push(parentPart.id);
        
        let assemblyOps = [];
        const sequence = this.engine.settings.assemblySequence || []; 
        const getMontazOps = (part) => {
             const typeKey = part.type === 'PARENT' ? 'casings' : 'functions';
             const routingKey = `${typeKey}_${part.size}_${part.code}_phase1`;
             return this.engine.config.routings[routingKey] || [];
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
        const flow = this.engine.config.flows.find(f => f.from === fromNodeId && f.to === toNodeId);
        if (!flow) return;

        if (this.engine.config.stations.find(s => s.id === toNodeId)) {
            this.engine.stationStates[toNodeId].incoming++;
        }

        const toolPoolId = this.engine.config.toolPools.find(p => p.assignedFlows && p.assignedFlows.includes(flow.id))?.id;
        const startTime = this.engine.simulationTime;

        if (!toolPoolId || !this.engine.toolPools[toolPoolId]) {
            part.updateState('IN_TRANSPORT', this.engine.simulationTime);
            const transportTime = (flow.distance / 1.0) / 3600; 
            const arrivalTime = this.engine.scheduler.calculateCompletionTime(this.engine.simulationTime, transportTime);
            
            this.engine.recordTransport(part, fromNodeId, toNodeId, startTime, arrivalTime);
            this.engine.scheduleEvent(arrivalTime, 'PART_ARRIVES_AT_NODE', { partId: part.id, nodeId: toNodeId });
            return;
        }

        const toolPool = this.engine.toolPools[toolPoolId];
        const toolGranted = toolPool.request(part, requiredTools);
        
        if (toolGranted) {
            part.updateState('IN_TRANSPORT', this.engine.simulationTime);
            const transportTime = (flow.distance / toolPool.speed) / 3600; 
            const arrivalTime = this.engine.scheduler.calculateCompletionTime(this.engine.simulationTime, transportTime);
            
            this.engine.scheduleEvent(
                arrivalTime, 
                'TRANSPORT_COMPLETE', 
                { partId: part.id, toNodeId: toNodeId, poolId: toolPoolId, requiredTools: requiredTools, fromNodeId: fromNodeId, startTime: startTime }
            );
        } else {
            part.updateState('WAITING_FOR_TOOL', this.engine.simulationTime);
        }
    }

    createAndSendPart(order, partBOM, typeKey, dueDate, delay = 0) {
        const routingKey = `${typeKey}_${partBOM.size}_${partBOM.code}_phase0`;
        const routing = this.engine.config.routings[routingKey];
        const initialRouting = routing || [];
        
        const productTypeId = `${typeKey}_${partBOM.size}_${partBOM.code}`;
        const startBuffer = this.engine.config.buffers.find(b => b.isStartBuffer && b.allowedProductTypes.includes(productTypeId));
        
        if (!startBuffer) return;
        
        this.engine.partCounter++;
        const newPart = new Part(
            this.engine.partCounter, 
            order.orderId, 
            partBOM.type, 
            partBOM.code, 
            partBOM.size, 
            initialRouting, 
            partBOM.childrenBOM, 
            this.engine.simulationTime + delay
        );
        newPart.dueDate = dueDate;
        newPart.currentLocation = startBuffer.id;
        newPart.updateState('IDLE_IN_BUFFER', this.engine.simulationTime + delay);

        this.engine.parts[newPart.id] = newPart;
        this.engine.scheduleEvent(this.engine.simulationTime + delay, 'PART_ARRIVES_AT_NODE', { partId: newPart.id, nodeId: startBuffer.id });
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
}