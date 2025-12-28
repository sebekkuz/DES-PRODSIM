import React, { useState, useEffect, useRef, useMemo } from 'react';

export const RealTimeViewer = ({ config, simulationData }) => {
    // === KONFIGURACJA STANU I WIDOKU ===
    const [currentTimeVal, setCurrentTimeVal] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Viewport (Pan & Zoom)
    const [viewState, setViewState] = useState({ x: 0, y: 0, zoom: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

    // Dane do wyświetlenia
    const [currentShiftInfo, setCurrentShiftInfo] = useState({ day: 0, hour: 0, shift: '-', isWorking: true });
    const [activeOrders, setActiveOrders] = useState([]); 
    const [finishedOrders, setFinishedOrders] = useState([]);
    
    // Stan buforów do tabeli
    const [bufferTableData, setBufferTableData] = useState({}); 
    
    const canvasRef = useRef(null);
    const animationFrameRef = useRef();
    const lastTimestampRef = useRef(0);
    const containerRef = useRef(null);

    // Kolory statusów (Oryginalne)
    const COLORS = {
        RUN: '#22c55e',      // Zielony
        IDLE: '#eab308',     // Żółty
        BLOCKED: '#ef4444',  // Czerwony
        OFFLINE: '#6b21a8',  // Fioletowy
        STARVED: '#f97316',  // Pomarańczowy
        WORKER: '#3b82f6',   // Niebieski
        PART_BODY: '#fff',
        PART_BORDER: '#333',
        ARROW_IDLE: '#facc15',  // Żółty (Domyślny)
        ARROW_ACTIVE: '#22c55e', // Zielony (Aktywny)
        WORKER_PATH: '#60a5fa' // Jasnoniebieski (Droga pracownika)
    };

    // === 1. PRZYGOTOWANIE DANYCH (PRE-PROCESSING) ===
    const { stationTimelines, bufferTimelines, transportEvents, workerTravelEvents, ordersMap } = useMemo(() => {
        if (!simulationData || !simulationData.replayEvents) 
            return { stationTimelines: {}, bufferTimelines: {}, transportEvents: [], workerTravelEvents: [], ordersMap: {} };
        
        const events = simulationData.replayEvents.sort((a, b) => a.time - b.time);
        
        // 1. Oś czasu stacji
        const sTimelines = {};
        config.stations.forEach(s => sTimelines[s.id] = []);
        events.filter(e => e.type === 'STATION_STATE').forEach(e => {
            if (sTimelines[e.stationId]) {
                sTimelines[e.stationId].push({ time: e.time, status: e.status, meta: e.meta });
            }
        });

        // 2. Oś czasu buforów
        const bTimelines = {};
        config.buffers.forEach(b => bTimelines[b.id] = []);
        events.filter(e => e.type === 'BUFFER_STATE').forEach(e => {
             if (bTimelines[e.bufferId]) {
                 bTimelines[e.bufferId].push({ 
                     time: e.time, 
                     count: e.count, 
                     content: e.content || [] 
                 });
             }
        });

        // 3. Eventy Transportowe (Produkt)
        const tEvents = events.filter(e => e.type === 'TRANSPORT');

        // 4. Eventy Podróży Pracownika
        const wEvents = events.filter(e => e.type === 'WORKER_TRAVEL');

        const oMap = {};
        if(simulationData.orderReports) {
            simulationData.orderReports.forEach(o => { oMap[o.id] = { ...o }; });
        }

        return { 
            replayEvents: events,
            stationTimelines: sTimelines,
            bufferTimelines: bTimelines,
            transportEvents: tEvents,
            workerTravelEvents: wEvents,
            ordersMap: oMap
        };
    }, [simulationData, config]);


    // === 2. LOGIKA PĘTLI CZASU I STEROWANIA ===
    const getShiftInfo = (timeHours) => {
        if (!simulationData?.shiftSettings) return { day: 1, hour: 0, shift: 'Domyślna', isWorking: true, dateStr: '' };
        
        const totalHours = timeHours;
        const dayIndex = Math.floor(totalHours / 24);
        const hourOfDay = totalHours % 24;
        
        const date = new Date(2025, 0, 1);
        date.setTime(date.getTime() + totalHours * 3600 * 1000); 
        const dateStr = date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

        let activeShiftName = 'Noc/Wolne';
        let isWorking = false;

        Object.keys(simulationData.shiftSettings).forEach(key => {
            const shift = simulationData.shiftSettings[key];
            if (!shift.active) return; 

            const currentDayOfWeek = dayIndex % 7;
            if (currentDayOfWeek >= shift.days) return;

            const [sH, sM] = shift.start.split(':').map(Number);
            const [eH, eM] = shift.end.split(':').map(Number);
            const startVal = sH + (sM / 60);
            const endVal = eH + (eM / 60);

            let inShift = false;
            
            if (endVal > startVal) {
                if (hourOfDay >= startVal && hourOfDay < endVal) inShift = true;
            } else {
                if (hourOfDay >= startVal || hourOfDay < endVal) inShift = true;
            }

            if (inShift) {
                activeShiftName = `Zmiana ${key}`;
                isWorking = true;
            }
        });

        return {
            day: dayIndex + 1,
            hour: hourOfDay,
            shift: activeShiftName,
            isWorking: isWorking, 
            dateStr
        };
    };

    const jumpToNextDay = () => {
        const nextDayStart = (Math.floor(currentTimeVal / 24) + 1) * 24 + 6;
        setCurrentTimeVal(Math.min(nextDayStart, simulationData.duration));
    };

    useEffect(() => {
        if (!isPlaying) {
            cancelAnimationFrame(animationFrameRef.current);
            return;
        }
        const animate = (timestamp) => {
            if (!lastTimestampRef.current) lastTimestampRef.current = timestamp;
            const delta = timestamp - lastTimestampRef.current;
            
            const hourStep = (delta / 1000) * (playbackSpeed / 3600); 
            
            setCurrentTimeVal(prev => {
                const next = prev + hourStep;
                if (next >= (simulationData?.duration || 100)) {
                    setIsPlaying(false);
                    return simulationData?.duration || 100;
                }
                return next;
            });
            lastTimestampRef.current = timestamp;
            animationFrameRef.current = requestAnimationFrame(animate);
        };
        animationFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [isPlaying, playbackSpeed, simulationData]);


    // === 3. RENDEROWANIE KANWY ===
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !config || !simulationData) return;
        const ctx = canvas.getContext('2d');
        
        const parent = canvas.parentElement;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        
        const { width, height } = canvas;
        
        ctx.fillStyle = "#1e293b"; 
        ctx.fillRect(0, 0, width, height);
        
        ctx.save();
        ctx.translate(viewState.x, viewState.y);
        ctx.scale(viewState.zoom, viewState.zoom);

        // Grid
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1 / viewState.zoom;
        ctx.beginPath();
        const gridSize = 100;
        const startX = -viewState.x / viewState.zoom;
        const startY = -viewState.y / viewState.zoom;
        const endX = startX + width / viewState.zoom;
        const endY = startY + height / viewState.zoom;
        
        for(let x=Math.floor(startX/gridSize)*gridSize; x<endX; x+=gridSize) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
        for(let y=Math.floor(startY/gridSize)*gridSize; y<endY; y+=gridSize) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
        ctx.stroke();

        // Połączenia Produktu (Strzałki)
        config.flows.forEach(flow => {
            const from = getNodePos(flow.from);
            const to = getNodePos(flow.to);
            if(from && to) drawFlowConnection(ctx, from, to, false, COLORS.ARROW_ACTIVE, COLORS.ARROW_IDLE);
        });
        
        // === STANY OBIEKTÓW ===
        const currentStationStatus = {};
        const partsInProcess = []; 
        const currentBufferStatus = {};
        
        // Stacje - Analiza
        config.stations.forEach(s => {
            const timeline = stationTimelines[s.id];
            // Szukamy aktywnych operacji w tym momencie
            // Ponieważ silnik może obsługiwać wiele slotów, szukamy wszystkich zdarzeń RUN, które się zaczęły, a nie skończyły
            // LUB (dla uproszczenia wczytywania) bierzemy ostatni znany stan, ale musimy być ostrożni z capacity
            
            // Nowe podejście: Filtrujemy zdarzenia RUN, które trwają w `currentTimeVal`
            // Wymaga to, aby worker zapisywał `startTime` i `endTime` w meta zdarzenia RUN (zrobiłem to w poprawce Workera)
            const activeOps = timeline ? timeline.filter(e => 
                e.status === 'RUN' && 
                e.meta && 
                e.meta.startTime <= currentTimeVal && 
                e.meta.endTime > currentTimeVal
            ) : [];

            // Status ogólny stacji
            let status = 'IDLE';
            if (activeOps.length > 0) status = 'RUN';
            // Tutaj można dodać logikę wykrywania AWARII jeśli ostatnie zdarzenie to STOP/AWARIA
            // Dla uproszczenia bazujemy na RUN/IDLE z aktywności
            
            currentStationStatus[s.id] = status;
            
            // Generowanie części na maszynie (dla każdego slotu)
            activeOps.forEach(op => {
                // Oblicz pozycję slotu
                const capacity = s.capacity || 1;
                // Jeśli capacity > 1, stacja jest szersza.
                // Bazowa szerokość 120. Każdy dodatkowy slot + 100?
                // Zdefiniujmy to spójnie z rysowaniem stacji poniżej.
                const stationBaseWidth = 120 + (Math.max(0, capacity - 1) * 80); 
                const slotWidth = (stationBaseWidth - 10) / capacity;
                
                // Slot index z meta (worker musi to wysyłać) lub fallback na index w tablicy
                const slotIdx = op.meta.slotIndex !== undefined ? op.meta.slotIndex : activeOps.indexOf(op);
                
                const slotX = s.x + 5 + (slotIdx * slotWidth);
                const slotY = s.y + 20; // Wewnątrz stacji
                
                partsInProcess.push({
                    orderId: op.meta.order || "?",
                    partCode: op.meta.part || "?",
                    subCode: op.meta.subCode || "?",
                    isAssembled: op.meta.isAssembled,
                    x: slotX + slotWidth/2, // Środek slotu
                    y: slotY + 25,          // Środek w pionie (względem slotu)
                    state: 'PROCESSING',
                    // Dodatki Progress/Timer
                    startTime: op.meta.startTime,
                    endTime: op.meta.endTime,
                    totalOps: op.meta.totalOps,
                    currentOp: op.meta.currentOp,
                    width: slotWidth - 10 // Przekazujemy szerokość do rysowania paska
                });
            });
        });

        // Bufory - Analiza
        const bufferTableUpdate = {};
        config.buffers.forEach(b => {
            const timeline = bufferTimelines[b.id];
            let count = 0;
            let content = [];
            
            if (timeline && timeline.length > 0) {
                for (let i = timeline.length - 1; i >= 0; i--) {
                    if (timeline[i].time <= currentTimeVal) { 
                        count = timeline[i].count; 
                        content = timeline[i].content;
                        break; 
                    }
                }
            }
            currentBufferStatus[b.id] = { count, content };
            bufferTableUpdate[b.id] = { name: b.name, count, content };
        });
        setBufferTableData(bufferTableUpdate);

        // RYSOWANIE OBIEKTÓW
        [...config.stations, ...config.buffers].forEach(node => {
            const isStation = !!node.type;
            const status = isStation ? (currentStationStatus[node.id] || 'OFFLINE') : 'IDLE';
            let color = COLORS[status] || COLORS.OFFLINE;
            let bufferInfo = isStation ? null : currentBufferStatus[node.id];
            
            if (!isStation) {
                const fillRatio = bufferInfo.count / node.capacity;
                if (fillRatio > 0.8) color = COLORS.BLOCKED;
                else if (fillRatio > 0) color = COLORS.IDLE;
                else color = '#475569';
            }

            // === ZMIANA 1: Rozszerzanie stacji (Capacity) ===
            let drawWidth = 120;
            if (isStation) {
                const cap = node.capacity || 1;
                // Rozszerzamy o 80px na każdy dodatkowy slot
                drawWidth = 120 + (Math.max(0, cap - 1) * 80);
            }

            if (status === 'RUN') { ctx.shadowBlur = 20; ctx.shadowColor = color; } 
            else { ctx.shadowBlur = 0; }

            ctx.fillStyle = "#1e293b";
            ctx.fillRect(node.x, node.y, drawWidth, 80);
            
            ctx.fillStyle = color;
            ctx.fillRect(node.x, node.y, drawWidth, 6); // Pasek statusu u góry
            
            ctx.lineWidth = 2;
            ctx.strokeStyle = color;
            ctx.strokeRect(node.x, node.y, drawWidth, 80);

            ctx.shadowBlur = 0;
            ctx.fillStyle = "#fff";
            ctx.font = "bold 11px Arial";
            ctx.textAlign = "center";
            wrapText(ctx, node.name, node.x + drawWidth / 2, node.y + 20, drawWidth - 10, 12);
            
            if (isStation) {
                // === ZMIANA 2: Rysowanie Slotów ===
                const cap = node.capacity || 1;
                const slotWidth = (drawWidth - 10) / cap;
                
                ctx.strokeStyle = "#475569";
                ctx.lineWidth = 1;
                
                for(let i=0; i<cap; i++) {
                    const sx = node.x + 5 + (i * slotWidth);
                    const sy = node.y + 25;
                    ctx.strokeRect(sx, sy, slotWidth - 2, 50);
                    
                    // Numer slotu (opcjonalnie)
                    ctx.fillStyle = "#334155";
                    ctx.font = "9px Arial";
                    ctx.fillText(`#${i+1}`, sx + slotWidth/2, sy + 45);
                }

                const icon = status === 'RUN' ? '⚙️' : (status === 'BLOCKED' ? '🛑' : (status === 'OFFLINE' ? '⚠️' : '💤'));
                // Ikona statusu po lewej u góry
                ctx.font = "14px Arial";
                ctx.fillText(icon, node.x + 15, node.y + 18);

            } else {
                // Bufor (bez zmian)
                ctx.font = "12px Arial";
                ctx.fillStyle = "#94a3b8";
                ctx.fillText(`Stan: ${bufferInfo.count} / ${node.capacity}`, node.x + 60, node.y + 45);
                const displayCount = Math.min(bufferInfo.count, 10);
                for(let i=0; i<displayCount; i++) {
                    ctx.fillStyle = COLORS.PART_BODY;
                    ctx.fillRect(node.x + 10 + (i*8), node.y + 60, 6, 6);
                }
            }
        });

        // CZĘŚCI NA MASZYNACH (Teraz z nowymi ficzerami)
        partsInProcess.forEach(part => {
            // Przekazujemy dodatkowe dane do rysowania
            drawPartTile(ctx, part.x, part.y, part.orderId, part.partCode, part.subCode, part.isAssembled, COLORS.RUN, {
                showProgress: true,
                startTime: part.startTime,
                endTime: part.endTime,
                currentTime: currentTimeVal,
                totalOps: part.totalOps,
                currentOp: part.currentOp,
                customWidth: part.width // Skalowalna szerokość kafelka
            });
        });

        // TRANSPORT PRODUKTÓW
        transportEvents.forEach(evt => {
            if (currentTimeVal >= evt.startTime && currentTimeVal <= evt.endTime) {
                const fromPos = getNodePos(evt.from);
                const toPos = getNodePos(evt.to);
                
                if (fromPos && toPos) {
                    const duration = evt.endTime - evt.startTime;
                    if (duration > 0) {
                        const progress = (currentTimeVal - evt.startTime) / duration;
                        
                        // Korekta punktów start/stop dla szerokich stacji
                        // Start: Prawa krawędź fromNode
                        const startX = fromPos.x + fromPos.width; 
                        const startY = fromPos.y + 40;
                        // Meta: Lewa krawędź toNode
                        const endX = toPos.x;
                        const endY = toPos.y + 40;

                        const currentX = startX + (endX - startX) * progress;
                        const currentY = startY + (endY - startY) * progress;

                        drawFlowConnection(ctx, {x: startX - fromPos.width, y: fromPos.y, width: fromPos.width}, toPos, true, COLORS.ARROW_ACTIVE, COLORS.ARROW_IDLE);
                        drawPartTile(ctx, currentX, currentY, evt.orderId, evt.partCode, evt.subCode, evt.isAssembled, "#fbbf24");
                    }
                }
            }
        });

        // TRANSPORT PRACOWNIKÓW
        workerTravelEvents.forEach(evt => {
            if (currentTimeVal >= evt.startTime && currentTimeVal <= evt.endTime) {
                const fromPos = getNodePos(evt.from); 
                const toPos = getNodePos(evt.to);

                if (fromPos && toPos) {
                    const duration = evt.endTime - evt.startTime;
                    if (duration > 0) {
                        const progress = (currentTimeVal - evt.startTime) / duration;
                        
                        // Środek do środka (uproszczenie dla pracowników)
                        const startX = fromPos.x + fromPos.width/2;
                        const startY = fromPos.y + 40;
                        const endX = toPos.x + toPos.width/2;
                        const endY = toPos.y + 40;

                        const currentX = startX + (endX - startX) * progress;
                        const currentY = startY + (endY - startY) * progress;

                        ctx.save();
                        ctx.beginPath();
                        ctx.strokeStyle = COLORS.WORKER_PATH;
                        ctx.lineWidth = 1;
                        ctx.setLineDash([3, 3]);
                        ctx.moveTo(startX, startY);
                        ctx.lineTo(endX, endY);
                        ctx.stroke();
                        ctx.restore();

                        drawWorkerCircle(ctx, currentX, currentY, COLORS.WORKER);
                    }
                }
            }
        });

        // PRACOWNICY NA STACJACH
        const workersAtStations = {}; 
        config.stations.forEach(s => {
            // Jeśli stacja ma activeOps, to rysujemy pracownika
            if (currentStationStatus[s.id] === 'RUN') {
                const workerFlow = config.workerFlows?.find(wf => wf.to === s.id);
                if (workerFlow) {
                    // Rysuj pracownika pod stacją
                    const width = 120 + (Math.max(0, (s.capacity || 1) - 1) * 80);
                    drawWorkerCircle(ctx, s.x + width/2, s.y + 95, COLORS.WORKER);
                    if (!workersAtStations[workerFlow.from]) workersAtStations[workerFlow.from] = 0;
                    workersAtStations[workerFlow.from]++;
                }
            }
        });

        // PULE PRACOWNIKÓW
        config.workerPools.forEach(wp => {
            const busy = workersAtStations[wp.id] || 0;
            const free = wp.capacity - busy;
            
            ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
            ctx.strokeStyle = COLORS.WORKER;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(wp.x + 30, wp.y + 30, 45, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.font = "bold 10px Arial";
            ctx.fillText(wp.name, wp.x + 30, wp.y + 15);
            ctx.font = "bold 14px Arial";
            ctx.fillStyle = free > 0 ? "#4ade80" : "#ef4444";
            ctx.fillText(`${free} / ${wp.capacity}`, wp.x + 30, wp.y + 35);
        });
        
        ctx.restore();
        updateSidebars();

    }, [config, simulationData, currentTimeVal, viewState, stationTimelines, bufferTimelines, transportEvents, workerTravelEvents]); 


    // === 4. SIDEBARY & UPDATE ===
    const updateSidebars = () => {
        if (!simulationData?.orderReports) return;
        const info = getShiftInfo(currentTimeVal);
        setCurrentShiftInfo(info);

        const active = [];
        const finished = [];

        simulationData.orderReports.forEach((o) => {
            const hasStarted = currentTimeVal >= o.startTime;
            const hasEnded = currentTimeVal >= o.endTime;
            
            if (hasEnded) {
                finished.push(o);
            } else if (hasStarted) {
                const duration = o.endTime - o.startTime;
                const progress = duration > 0 ? (currentTimeVal - o.startTime) / duration : 0;
                const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
                
                const segments = o.code.split('-');
                const renderedSegments = segments.map((seg, i) => (
                    <span key={i} className="text-gray-400">{seg}{i < segments.length - 1 ? '-' : ''}</span>
                ));

                active.push({ ...o, pct, renderedCode: renderedSegments });
            }
        });
        
        setActiveOrders(active);
        setFinishedOrders(finished);
    };
    
    // === HELPERY RYSOWANIA ===
    const getNodePos = (id) => {
        const s = config.stations.find(n => n.id === id);
        if (s) {
            // Uwzględnij dynamiczną szerokość
            const width = 120 + (Math.max(0, (s.capacity || 1) - 1) * 80);
            return { x: s.x, y: s.y, width: width };
        }
        
        const b = config.buffers.find(n => n.id === id);
        if (b) return { x: b.x, y: b.y, width: 120 };
        
        const wp = config.workerPools.find(n => n.id === id);
        if (wp) return { x: wp.x, y: wp.y, width: 60 };

        return { x: 0, y: 0, width: 0 };
    };

    const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
        const words = text.split(' ');
        let line = '';
        let lines = [];
        for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) { lines.push(line); line = words[n] + ' '; } 
            else { line = testLine; }
        }
        lines.push(line);
        let startY = y - ((lines.length - 1) * lineHeight) / 2; 
        lines.forEach((l, i) => { ctx.fillText(l, x, startY + (i * lineHeight)); });
    };

    const drawPartTile = (ctx, x, y, orderId, partCode, subCode, isAssembled, color, extra = {}) => {
        // Obsługa custom width dla slotów
        const w = extra.customWidth || 90; 
        const h = 50; 
        
        ctx.save(); ctx.translate(x - w/2, y - h/2);
        
        ctx.shadowBlur = 5; ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.fillStyle = "#fff";
        ctx.beginPath(); 
        if (isAssembled) ctx.roundRect(0, 0, w, h, h/2); else ctx.roundRect(0, 0, w, h, 4);
        ctx.fill(); ctx.shadowBlur = 0;

        ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.stroke();
        ctx.fillStyle = color; 
        if (isAssembled) { ctx.beginPath(); ctx.arc(10, h/2, 4, 0, Math.PI*2); ctx.fill(); } else { ctx.fillRect(0, 0, 6, h); }

        ctx.textAlign = "left";
        
        // Tekst (Skalowalny w zależności od szerokości)
        if (w > 60) {
            ctx.font = "9px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText(`Zl: ${orderId}`, 10, 12);
            ctx.font = "bold 10px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(`${partCode}`, 10, 24);
            ctx.font = "bold 12px Arial"; ctx.fillStyle = "#d97706"; ctx.fillText(`${subCode || '-'}`, 10, 38);
        } else {
            // Wersja mini dla małych slotów
            ctx.font = "bold 10px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(`${subCode}`, 8, 28);
        }

        // === ZMIANA 3: Pasek Postępu i Timer ===
        if (extra.showProgress && extra.totalOps) {
            // Pasek
            const totalDur = extra.endTime - extra.startTime;
            const elapsed = extra.currentTime - extra.startTime;
            const pct = Math.min(1, Math.max(0, elapsed / totalDur));
            
            const barH = 4;
            const barY = h - barH - 2;
            
            ctx.fillStyle = "#e2e8f0";
            ctx.fillRect(2, barY, w - 4, barH);
            ctx.fillStyle = "#22c55e"; // Zielony pasek
            ctx.fillRect(2, barY, (w - 4) * pct, barH);

            // Timer i Licznik operacji (małym drukiem na dole)
            const timeLeft = Math.max(0, totalDur - elapsed).toFixed(1);
            ctx.fillStyle = "#64748b";
            ctx.font = "8px Arial";
            ctx.textAlign = "right";
            // Np. "1.5h | 2/5"
            ctx.fillText(`${timeLeft}h | Op: ${extra.currentOp}/${extra.totalOps}`, w - 4, barY - 2);
        }

        ctx.restore();
    };

    const drawWorkerCircle = (ctx, x, y, color) => {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 9px Arial"; ctx.textAlign = "center"; ctx.fillText("W", x, y + 3); ctx.restore();
    };

    const drawFlowConnection = (ctx, from, to, isActive, activeColor, idleColor) => {
        // Obsługa szerokich stacji: from/to może być obiektem {x, y, width}
        const startX = from.x + (from.width || 120); 
        const startY = from.y + 40;
        const endX = to.x;
        const endY = to.y + 40;

        ctx.beginPath(); ctx.strokeStyle = isActive ? activeColor : idleColor; ctx.lineWidth = isActive ? 3 : 1;
        if (isActive) ctx.setLineDash([5, 5]); 
        const midX = startX + (endX - startX) / 2;
        ctx.moveTo(startX, startY); ctx.lineTo(midX, startY); ctx.lineTo(midX, endY); ctx.lineTo(endX, endY);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(endX, endY); ctx.lineTo(endX - 6, endY - 3); ctx.lineTo(endX - 6, endY + 3); ctx.fill();
    };

    // Handlery myszy
    const handleMouseDown = (e) => { setIsDragging(true); setLastMousePos({ x: e.clientX, y: e.clientY }); };
    const handleMouseMove = (e) => { if (!isDragging) return; const dx = e.clientX - lastMousePos.x; const dy = e.clientY - lastMousePos.y; setViewState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); setLastMousePos({ x: e.clientX, y: e.clientY }); };
    const handleMouseUp = () => setIsDragging(false);
    const handleWheel = (e) => { const scale = e.deltaY > 0 ? 0.9 : 1.1; setViewState(prev => ({ ...prev, zoom: Math.min(Math.max(0.5, prev.zoom * scale), 3) })); };
    const handleTimelineChange = (e) => { setCurrentTimeVal(parseFloat(e.target.value)); setIsPlaying(false); };

    // === TABELA BUFORÓW ===
    const BufferTable = () => {
        const bufferIds = Object.keys(bufferTableData);
        if (bufferIds.length === 0) return <div className="p-2 text-gray-500 text-xs">Brak danych buforów</div>;

        return (
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-gray-300">
                    <thead className="bg-gray-800 text-gray-400 font-bold">
                        <tr>
                            <th className="p-2 border-b border-gray-700">Bufor</th>
                            <th className="p-2 border-b border-gray-700 w-16">Ilość</th>
                            <th className="p-2 border-b border-gray-700">Zawartość</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bufferIds.map(id => {
                            const buf = bufferTableData[id];
                            const grouped = {};
                            buf.content.forEach(item => { 
                                const key = `${item.orderId || '?'}__${item.code || '?'}`;
                                if (!grouped[key]) { grouped[key] = { count: 0, orderId: item.orderId, code: item.code }; }
                                grouped[key].count++;
                            });
                            const contentStr = Object.values(grouped).map(g => `(${g.count}x) Zl: ${g.orderId} - ${g.code}`).join(' | ');

                            return (
                                <tr key={id} className="border-b border-gray-800 hover:bg-gray-800">
                                    <td className="p-2 font-medium text-blue-400">{buf.name}</td>
                                    <td className="p-2 font-bold">{buf.count}</td>
                                    <td className="p-2 text-gray-400 break-all">{contentStr || '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-gray-900 text-white overflow-hidden">
            <div className="h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 shadow-md z-20 shrink-0">
                <div className="flex items-center space-x-6">
                    <div className="flex flex-col"><span className="text-[10px] text-gray-400 uppercase font-bold">Czas Symulacji</span><div className="text-lg font-mono text-blue-400 font-bold">{currentShiftInfo.dateStr}</div></div>
                    <div className="flex flex-col border-l border-gray-600 pl-4"><span className="text-[10px] text-gray-400">Zmiana</span><span className={`text-sm font-bold ${currentShiftInfo.isWorking ? 'text-green-400' : 'text-red-400'}`}>{currentShiftInfo.shift} {currentShiftInfo.isWorking ? '(PRACA)' : '(WOLNE)'}</span></div>
                </div>
                <div className="flex items-center space-x-3 bg-gray-900 p-1 rounded-lg border border-gray-700">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-lg transition-colors">{isPlaying ? '⏸️' : '▶️'}</button>
                    <select value={playbackSpeed} onChange={e => setPlaybackSpeed(Number(e.target.value))} className="bg-gray-800 text-xs p-1 rounded border border-gray-600 outline-none">
                        <option value="1">1x</option>
                        <option value="2">2x</option>
                        <option value="3">3x</option>
                        <option value="4">4x</option>
                        <option value="5">5x</option>
                        <option value="6">6x</option>
                        <option value="7">7x</option>
                        <option value="8">8x</option>
                        <option value="9">9x</option>
                        <option value="10">10x</option>
                    </select>
                    <button onClick={jumpToNextDay} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-bold">⏭️ Nast. Dzień</button>
                </div>
            </div>
            <div className="flex-1 flex overflow-hidden">
                <div className="w-64 bg-[#1e293b] border-r border-gray-700 flex flex-col z-10 shadow-xl shrink-0">
                    <div className="p-3 bg-[#0f172a] border-b border-gray-700 flex items-center"><span className="mr-2">📦</span><h3 className="font-bold text-xs uppercase tracking-wider text-blue-400">AKTYWNE ZLECENIA ({activeOrders.length})</h3></div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {activeOrders.map((order, i) => (
                            <div key={i} className="bg-[#334155] rounded-lg border border-gray-600 p-3 shadow-lg relative overflow-hidden">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="text-sm font-bold text-white">Zl: {order.id.replace(/\.$/, '')} <span className="text-gray-400 text-xs ml-1">{order.size}</span></div>
                                    <span className="text-xs font-bold text-green-400">OK</span>
                                </div>
                                <div className="text-[10px] text-gray-400 mb-2 font-mono break-all leading-tight">{order.renderedCode}</div>
                                <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden"><div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{width: `${order.pct}%`}}></div></div>
                            </div>
                        ))}
                        {activeOrders.length === 0 && <div className="text-center text-gray-500 py-10 text-xs">Brak aktywnych zleceń</div>}
                    </div>
                </div>
                <div className="flex-1 flex flex-col relative bg-gray-900 overflow-hidden min-w-0">
                    <div className="flex-1 relative cursor-move min-h-0" ref={containerRef}>
                        <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} className="block w-full h-full"/>
                        <div className="absolute top-4 right-4 bg-gray-800/90 border border-gray-600 p-3 rounded shadow-lg text-[10px] text-gray-300 pointer-events-none">
                            <div className="font-bold mb-2 uppercase text-gray-400">Legenda</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                <div className="flex items-center"><span className="w-3 h-3 rounded-sm mr-2 bg-[#22c55e]"></span> Praca</div>
                                <div className="flex items-center"><span className="w-3 h-3 rounded-sm mr-2 bg-[#eab308]"></span> Oczekiwanie</div>
                                <div className="flex items-center"><span className="w-3 h-3 rounded-sm mr-2 bg-[#ef4444]"></span> Blokada</div>
                                <div className="flex items-center"><span className="w-3 h-3 rounded-full mr-2 border border-white bg-[#3b82f6]"></span> Pracownik</div>
                                <div className="flex items-center"><span className="w-8 h-1 mr-2 bg-[#22c55e]"></span> Flow (Ruch)</div>
                            </div>
                        </div>
                    </div>
                    <div className="h-10 bg-gray-800/90 px-4 border-t border-gray-600 flex items-center space-x-4 shrink-0 z-20">
                        <span className="text-xs font-mono w-12 text-right">{currentTimeVal.toFixed(1)}h</span>
                        <input type="range" min="0" max={simulationData?.duration || 100} step="0.1" value={currentTimeVal} onChange={handleTimelineChange} className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                        <span className="text-xs font-mono w-12">{(simulationData?.duration || 100).toFixed(1)}h</span>
                    </div>
                    <div className="h-40 bg-gray-900 border-t border-gray-700 overflow-y-auto shrink-0 z-20 shadow-inner p-2">
                        <h4 className="text-xs font-bold text-gray-500 mb-2 sticky top-0 bg-gray-900 py-1 border-b border-gray-800">STAN BUFORÓW (LIVE)</h4>
                        <BufferTable />
                    </div>
                </div>
                <div className="w-56 bg-gray-800 border-l border-gray-700 flex flex-col z-10 shadow-xl shrink-0">
                    <div className="p-3 bg-gray-900 border-b border-gray-700 font-bold text-xs uppercase tracking-wider text-green-400">🏁 Zakończone ({finishedOrders.length})</div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {finishedOrders.map((order, i) => (
                            <div key={i} className="bg-gray-700/50 p-2 rounded border border-gray-600/50 text-xs flex justify-between items-center opacity-70">
                                <div><div className="font-bold text-gray-300">Zl: {order.id}</div><div className="text-[9px] text-gray-500">{order.code}</div></div>
                                <div className="text-right font-mono text-green-400">{order.duration}h</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};