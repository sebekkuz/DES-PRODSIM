'use strict';
import { Part } from './simulation_models.js';

export class SimulationEventHandler {
    constructor(engine) {
        this.engine = engine;
        this.roundRobinCounter = 0;
    }

    handleEvent(event) {
        switch(event.type) {
            case 'ORDER_ARRIVAL': this.handleOrderArrival(event.payload); break;
            case 'PART_ARRIVES_AT_NODE': this.handlePartArrivalAtNode(event.payload); break;
            case 'WORKER_ARRIVES_AT_STATION': this.handleWorkerArrives(event.payload); break;
            case 'OPERATION_COMPLETE': this.handleOperationComplete(event.payload); break;
            case 'TRANSPORT_COMPLETE': this.handleTransportComplete(event.payload); break;
        }
    }

    // --- BOM & ORDERS LOGIC ---
    
    handleOrderArrival(payload) {
        const { order } = payload;
        this.engine.orderMap[order.orderId] = order.orderString;
        
        // Parsowanie stringa zamówienia na strukturę BOM
        const bom = this.parseOrderString(order.orderString, order.orderSize); 
        
        let stagger = 0;
        bom.forEach(parent => {
            // Tworzymy Parenta (np. Ościeżnica)
            this.createPart(order, parent, 'casings', stagger);
            
            // Tworzymy Dzieci (np. Skrzydła)
            parent.childrenBOM.forEach(child => {
                this.createPart(order, child, 'functions', stagger);
            });
            
            // Staggering (lekkie opóźnienie) zapobiega idealnemu nakładaniu się eventów
            stagger += 0.002;
        });
    }

    parseOrderString(str, size) {
        // Logika Legacy do parsowania stringów typu "M1-M2L-M1"
        const parts = str.split('-'); 
        const bom = []; 
        let sec = 0;
        
        for(let i=0; i<parts.length; i++) {
            if(parts[i].startsWith('M')) {
                sec++;
                const p = { 
                    partId: `S${sec}_${parts[i]}`, 
                    type: 'PARENT', 
                    size, 
                    code: parts[i], 
                    childrenBOM: [] 
                };
                
                // Sprawdzenie czy następny element to konfiguracja skrzydeł (nie zaczyna się od M)
                if(i+1 < parts.length && !parts[i+1].startsWith('M')) {
                    parts[i+1].split('').forEach(c => {
                        p.childrenBOM.push({ 
                            partId: `S${sec}_C_${c}`, 
                            type: 'CHILD', 
                            size, 
                            code: c 
                        });
                    });
                    i++; // Przeskakujemy przetworzony element
                }
                bom.push(p);
            }
        }
        return bom;
    }

    createPart(order, bomItem, typeKey, delay) {
        const typeId = `${typeKey}_${bomItem.size}_${bomItem.code}`;
        
        // Znajdź bufor startowy dla tego typu produktu
        let buf = this.engine.config.buffers.find(b => b.isStartBuffer && b.allowedProductTypes?.includes(typeId));
        // Fallback: dowolny startowy
        if(!buf) buf = this.engine.config.buffers.find(b => b.isStartBuffer);
        
        if(!buf) {
            console.error(`Nie znaleziono bufora startowego dla ${typeId}`);
            return;
        }

        this.engine.partCounter++;
        // Ustalenie routingu (Legacy naming convention: type_size_code_phase0)
        const routingKey = `${typeKey}_${bomItem.size}_${bomItem.code}_phase0`;
        
        const part = new Part(
            this.engine.partCounter, 
            order.orderId, 
            bomItem.type, 
            bomItem.code, 
            bomItem.size, 
            this.engine.config.routings[routingKey] || [], 
            bomItem.childrenBOM, 
            this.engine.simulationTime + delay
        );
        part.dueDate = order.dueDate;
        
        this.engine.parts[part.id] = part;
        this.engine.scheduleEvent(this.engine.simulationTime + delay, 'PART_ARRIVES_AT_NODE', { partId: part.id, nodeId: buf.id });
    }

    // --- FLOW LOGIC ---

    handlePartArrivalAtNode({ partId, nodeId }) {
        const part = this.engine.parts[partId];
        if(!part) return; // Zabezpieczenie
        
        part.currentLocation = nodeId;
        const buf = this.engine.config.buffers.find(b => b.id === nodeId);
        
        if (buf) {
            // JESTEŚMY W BUFORZE
            part.updateState('IDLE_IN_BUFFER', this.engine.simulationTime);
            const bs = this.engine.bufferStates[nodeId];
            bs.queue.push(partId);
            this.engine.recordBufferState(nodeId, bs.queue);
            
            if (buf.isEndBuffer) { 
                this.finalizePart(part); 
                return; 
            }

            // Sprawdź czy wyjście z tego bufora prowadzi na STACJĘ MONTAŻOWĄ
            // Jest to kluczowe dla "Pull System" montażu
            const montazFlow = this.engine.config.flows.find(f => f.from === nodeId && this.isAssemblyStation(f.to));
            
            if(montazFlow) {
                // Jeśli to montaż, stacja sama "pociągnie" (Pull) jeśli ma komplet, 
                // ale musimy spróbować zainicjować sprawdzenie
                this.tryStartMontaz(montazFlow.to);
            } else {
                // Zwykły przepływ (Push)
                this.tryPushFromBuffer(nodeId);
            }

        } else {
            // JESTEŚMY NA STACJI (transport zakończony)
            const ss = this.engine.stationStates[nodeId];
            if(ss.incoming > 0) ss.incoming--;
            
            part.updateState('IDLE_AT_STATION', this.engine.simulationTime);
            ss.queue.push(partId);
            
            // Próbujemy rozpocząć operację
            this.tryStartOperation(nodeId);
        }
    }

    // --- WORK & OPERATIONS LOGIC ---

    handleWorkerArrives({ partId, stationId, poolId, requiredOperators }) {
        const part = this.engine.parts[partId];
        const st = this.engine.config.stations.find(s => s.id === stationId);
        
        let time = 0.1; // Domyślny minimalny czas
        const op = part.getNextOperation();
        if(op && op.time) time = op.time;
        
        // Obliczenie czasu zakończenia uwzględniając zmiany robocze
        const endT = this.engine.scheduler.calculateCompletionTime(this.engine.simulationTime, time);
        
        // Logika wizualna
        this.engine.recordStateChange(stationId, 'RUN', { part: part.code, duration: time });
        
        // Zaplanuj koniec operacji
        this.engine.scheduleEvent(endT, 'OPERATION_COMPLETE', { partId, stationId, poolId, requiredOperators, duration: time });
    }

    handleOperationComplete({ partId, stationId, poolId, requiredOperators, duration }) {
        const part = this.engine.parts[partId];
        const ss = this.engine.stationStates[stationId];
        ss.totalBusyTime += duration;
        
        // 1. ZWOLNIENIE PRACOWNIKA + PARALLEL WAKE UP
        if(poolId) {
            this.engine.workerPools[poolId].release(part, requiredOperators, duration);
            
            // [FIX] Znajdź WSZYSTKIE stacje, które mogą czekać na tego pracownika (z tej puli)
            // Stara wersja budziła tylko jedną stację, co powodowało "usypianie" maszyn równoległych.
            const connectedStations = this.engine.config.workerFlows
                .filter(wf => wf.from === poolId)
                .map(wf => wf.to);
            
            // Dołączamy też obecną stację, bo może mieć kolejkę
            const stationsToWake = [...new Set([...connectedStations, stationId])];
            
            stationsToWake.forEach(s => this.tryStartOperation(s));
        }

        // 2. AKTUALIZACJA CZĘŚCI
        part.routingStep++;
        const nextOp = part.getNextOperation();
        const st = this.engine.config.stations.find(s => s.id === stationId);

        // 3. LOGIKA "SAME STATION" (jeśli kolejna operacja jest na tej samej stacji)
        if(nextOp && this.isStationCapable(st, nextOp)) {
            // Wrzucamy na początek kolejki (priorytet dla kontynuacji)
             ss.queue.unshift(partId);
             this.tryStartOperation(stationId);
             return;
        }

        // 4. ZWOLNIENIE MASZYNY I PRÓBA POBRANIA NOWEJ CZĘŚCI
        // (Maszyna jest wolna dopiero teraz, jeśli nie kontynuujemy z tą samą częścią)
        // Uwaga: busySlots-- robimy dopiero gdy maszyna jest fizycznie wolna, 
        // ale w tym modelu `tryStartOperation` sprawdza `busySlots < capacity`.
        // Musimy zwolnić slot logiczny, ale `tryStart` sam sobie inkrementuje.
        // Tutaj nie dekrementujemy busySlots explicite, bo zakładamy, że slot jest zwalniany 
        // przy wyjściu części ze stacji.
        // W TWOIM MODELU: busySlots jest zwiększane w tryStartOperation. 
        // Musimy je zmniejszyć TERAZ, skoro operacja się skończyła i część wyjeżdża.
        if (ss.busySlots > 0) ss.busySlots--; 

        // Próbujemy wziąć nową część z kolejki stacji
        this.tryStartOperation(stationId);
        
        // Powiadamiamy bufory "upstream", że zwolniło się miejsce (Pull)
        this.notifyUpstream(stationId);

        // 5. TRANSPORT DO NASTĘPNEGO PUNKTU
        const flow = this.engine.config.flows.find(f => f.from === stationId);
        
        if(flow) {
            this.initiateTransport(part, stationId, flow.to);
        } else {
             if(nextOp) { 
                 console.warn("Część utknęła (Brak przepływu/Flow):", part.code); 
                 part.updateState('STUCK', this.engine.simulationTime);
             } else {
                 this.finalizePart(part);
             }
        }
    }

    // --- MONTAŻ (CRITICAL FIX: DEEP SCAN) ---
    
    tryStartMontaz(stationId) {
        const ss = this.engine.stationStates[stationId];
        const st = this.engine.config.stations.find(s => s.id === stationId);
        
        // Sprawdź czy stacja ma wolne moce przerobowe
        if(ss.busySlots >= st.capacity) return;

        // Znajdź wszystkie bufory wejściowe do tej stacji
        const inputs = this.engine.config.flows.filter(f => f.to === stationId).map(f => f.from);
        if(inputs.length === 0) return;

        // [FIX] Skanujemy WSZYSTKIE bufory wejściowe i CAŁE ich kolejki
        // Nie możemy patrzeć tylko na queue[0], bo tam może być "Dziecko" czekające na "Rodzica",
        // który jest np. na pozycji 5 w innym buforze.
        
        for(const bufId of inputs) {
            const bs = this.engine.bufferStates[bufId];
            
            // Iteracja po całej kolejce bufora
            for(let i=0; i<bs.queue.length; i++) {
                const candId = bs.queue[i];
                const cand = this.engine.parts[candId];
                
                // Szukamy kandydata na "Główny element" (Parent) lub elementu, który ma zdefiniowane dzieci w BOM
                if(cand.type === 'PARENT' || (cand.childrenBOM && cand.childrenBOM.length > 0)) {
                    
                    // Sprawdź, czego mu brakuje
                    const missing = cand.childrenBOM.filter(ch => 
                        !cand.attachedChildren.some(ac => ac.code === ch.code)
                    );
                    
                    // Jeśli ma już wszystko (lub nie potrzebuje nic), montujemy
                    if(missing.length === 0) {
                        this.execMontaz(stationId, cand, bufId, []); 
                        return; // Montujemy jeden zestaw i wychodzimy (kolejna próba nastąpi po zwolnieniu)
                    }
                    
                    // Jeśli brakuje dzieci, szukamy ich w dostępnych buforach
                    const foundChildren = [];
                    let allFound = true;
                    
                    for(const req of missing) {
                        let foundChild = false;
                        
                        // Przeszukaj wszystkie bufory wejściowe
                        for(const cBufId of inputs) {
                            const cBs = this.engine.bufferStates[cBufId];
                            
                            // Szukamy pasującego dziecka
                            // Warunki: Inne ID niż rodzic, Ten sam OrderID, Zgodny Code
                            // ORAZ: nie zostało już użyte w tym cyklu szukania
                            const cIdx = cBs.queue.findIndex(id => {
                                const p = this.engine.parts[id];
                                return p.id !== cand.id && 
                                       !foundChildren.some(x => x.id === p.id) && 
                                       p.orderId === cand.orderId && 
                                       p.code === req.code;
                            });
                            
                            if(cIdx !== -1) {
                                foundChildren.push({ id: cBs.queue[cIdx], buf: cBufId });
                                foundChild = true; 
                                break; // Znaleziono to konkretne wymaganie, idziemy do następnego
                            }
                        }
                        
                        if(!foundChild) { 
                            allFound = false; 
                            break; // Brakuje choćby jednego elementu -> nie montujemy
                        }
                    }
                    
                    if(allFound) { 
                        this.execMontaz(stationId, cand, bufId, foundChildren); 
                        return; 
                    }
                }
            }
        }
    }

    execMontaz(stId, parent, pBuf, children) {
        // Usuń rodzica z bufora
        this.removeFromBuf(pBuf, parent.id);
        
        // Usuń dzieci z ich buforów i dołącz do rodzica
        children.forEach(c => {
            this.removeFromBuf(c.buf, c.id);
            const chP = this.engine.parts[c.id];
            chP.updateState('ASSEMBLED', this.engine.simulationTime);
            parent.attachedChildren.push(chP);
        });
        
        // Przenieś "scaloną" część na stację montażową
        const ss = this.engine.stationStates[stId];
        ss.incoming++; // Rezerwacja slotu przychodzącego
        
        // Transport na stację (skipInc=true, bo już zwiększyliśmy incoming ręcznie)
        this.initiateTransport(parent, pBuf, stId, true);
    }

    // --- HELPERS & COMPATIBILITY ---

    isAssemblyStation(sid) {
        const s = this.engine.config.stations.find(x => x.id === sid);
        if(!s) return false;
        
        // [FIX] Legacy Flag Support: Sprawdź czy jakakolwiek operacja ma flagę montaz: 1
        // Nowy JSON może tego nie mieć, ale stary (ProdSim_PEŁNY) na tym polega.
        if(s.allowedOps && s.allowedOps.some(o => o.montaz == 1 || o.montaz === '1')) return true;
        
        // Standardowe sprawdzenie typu
        const t = (s.type || "").toLowerCase();
        return t.includes('montaz') || t.includes('assembly');
    }

    isStationCapable(s, op) { 
        return s.allowedOps?.some(o => o.id === op.id); 
    }
    
    notifyUpstream(sid) {
        // Jeśli stacja jest montażowa, musi wykonać aktywny skan (Pull)
        if(this.isAssemblyStation(sid)) {
            this.tryStartMontaz(sid);
        } else {
            // Jeśli zwykła, powiedz buforom przed nią, żeby próbowały pchać (Push)
            this.engine.config.flows
                .filter(f => f.to === sid)
                .forEach(f => {
                    if(f.from.startsWith('buf')) this.tryPushFromBuffer(f.from);
                });
        }
    }

    tryStartOperation(sid) {
        const ss = this.engine.stationStates[sid];
        const st = this.engine.config.stations.find(s => s.id === sid);
        
        // Sprawdź dostępność maszyny
        if(ss.queue.length === 0 || ss.busySlots >= st.capacity) return;
        
        const part = this.engine.parts[ss.queue[0]]; // Bierzemy pierwszego z kolejki
        const op = part.getNextOperation();
        const reqOps = op?.operators !== undefined ? op.operators : 1; // Domyślnie 1 operator
        
        // Znajdź powiązaną pulę pracowników
        const wf = this.engine.config.workerFlows.find(f => f.to === sid);

        if(!wf || reqOps === 0) {
            // Maszyna automatyczna (bez operatora)
            ss.queue.shift(); 
            ss.busySlots++;
            this.handleWorkerArrives({ partId: part.id, stationId: sid, poolId: null, requiredOperators: 0 });
            
            // Zwolniliśmy miejsce w kolejce, powiadom upstream
            this.notifyUpstream(sid);
        } else {
            // Maszyna wymaga operatora
            const pool = this.engine.workerPools[wf.from];
            if(pool.request(part, reqOps)) {
                ss.queue.shift(); 
                ss.busySlots++;
                
                // Czas dojścia pracownika (uproszczony)
                const arrT = this.engine.simulationTime + 0.001; 
                this.engine.scheduleEvent(arrT, 'WORKER_ARRIVES_AT_STATION', { 
                    partId: part.id, 
                    stationId: sid, 
                    poolId: wf.from, 
                    requiredOperators: reqOps 
                });
                
                this.notifyUpstream(sid);
            }
            // Jeśli pool.request zwróci false, nic nie robimy - czekamy na zwolnienie pracownika
        }
    }

    tryPushFromBuffer(bid) {
        const bs = this.engine.bufferStates[bid];
        if(bs.queue.length === 0) return;
        
        // Round Robin dla wyjść z bufora (jeśli jest wiele maszyn do wyboru)
        const flows = this.engine.config.flows.filter(f => f.from === bid);
        if(flows.length === 0) return;

        const part = this.engine.parts[bs.queue[0]];
        const nextOp = part.getNextOperation();
        
        // Jeśli brak operacji, usuń część (koniec procesu dla niej tutaj?)
        if(!nextOp) { 
            // To rzadki przypadek, zazwyczaj obsłużony w EndBuffer
            return; 
        }

        // Prosty Round Robin / Load Balancing
        // Próbujemy znaleźć wolną stację docelową
        // [FIX] Ignoruj stacje montażowe (one same pobierają - Pull)
        const validFlows = flows.filter(f => !this.isAssemblyStation(f.to));

        for(let i=0; i<validFlows.length; i++) {
            // Używamy licznika, żeby nie zawsze zaczynać od pierwszej maszyny
            const flowIdx = (this.roundRobinCounter + i) % validFlows.length;
            const flow = validFlows[flowIdx];
            const st = this.engine.config.stations.find(s => s.id === flow.to);
            const ss = this.engine.stationStates[st.id];

            // Sprawdzamy czy stacja może przyjąć (ma miejsce w kolejce wejściowej lub na maszynie)
            // Tutaj prosta logika: jeśli mniej niż 10 w kolejce (lub inny limit), pchaj.
            // Lub po prostu: pchaj, a kolejka na stacji urośnie.
            // W DES zazwyczaj pchamy, jeśli jest miejsce fizyczne.
            
            // Sprawdzenie kompatybilności stacji z operacją
            if(this.isStationCapable(st, nextOp)) {
                this.roundRobinCounter++; // Aktualizacja licznika
                bs.queue.shift(); // Usuń z bufora
                
                // Transport
                this.engine.stationStates[st.id].incoming++;
                this.initiateTransport(part, bid, st.id);
                return; // Sukces, wysłano jedną część
            }
        }
    }

    initiateTransport(p, from, to, skipInc = false) {
        if(!skipInc) { 
             const ss = this.engine.stationStates[to];
             if(ss) ss.incoming++; 
        }
        // Symulujemy czas transportu
        const arrT = this.engine.simulationTime + 0.001;
        this.engine.recordTransport(p, from, to, this.engine.simulationTime, arrT);
        this.engine.scheduleEvent(arrT, 'PART_ARRIVES_AT_NODE', { partId: p.id, nodeId: to });
    }
    
    removeFromBuf(bid, pid) {
        const q = this.engine.bufferStates[bid].queue;
        const idx = q.indexOf(pid);
        if(idx !== -1) q.splice(idx, 1);
    }
    
    handleTransportComplete(pl) { 
        // Transport kończy się zdarzeniem PART_ARRIVES_AT_NODE, więc tu pusto
    }
    
    finalizePart(p) { 
        p.updateState('FINISHED', this.engine.simulationTime); 
        this.engine.stats.partsProcessed++; 
    }
}