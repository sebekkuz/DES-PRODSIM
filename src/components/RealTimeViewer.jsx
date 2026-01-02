import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Play, 
    Pause, 
    SkipForward, 
    Clock, 
    Layers, 
    Package, 
    CheckCircle2, 
    RotateCcw,
    ZoomIn,
    ZoomOut,
    PanelBottomOpen,
    PanelBottomClose,
    Hourglass,
    Cog
} from 'lucide-react';

export const RealTimeViewer = ({ config, simulationData }) => {
    // === KONFIGURACJA STANU ===
    const [currentTimeVal, setCurrentTimeVal] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBufferPanelOpen, setIsBufferPanelOpen] = useState(true); 
    
    const [viewState, setViewState] = useState({ x: 0, y: 0, zoom: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

    const [currentShiftInfo, setCurrentShiftInfo] = useState({ day: 0, hour: 0, shift: '-', isWorking: true });
    const [activeOrders, setActiveOrders] = useState([]); 
    const [finishedOrders, setFinishedOrders] = useState([]);
    const [bufferTableData, setBufferTableData] = useState({}); 
    
    const canvasRef = useRef(null);
    const animationFrameRef = useRef();
    const lastTimestampRef = useRef(0);
    const containerRef = useRef(null);

    // === STAŁE WYMIAROWE ===
    const STATION_HEIGHT = 100; 
    const HEADER_HEIGHT = 35;   
    const SLOT_WIDTH_FIXED = 130; 
    const STATION_PADDING = 10;   
    const SLOT_HEIGHT = 50;       
    const PART_MARGIN = 6;        

    // Kolory
    const COLORS = {
        RUN: '#22c55e',      
        IDLE: '#eab308',     
        BLOCKED: '#ef4444',  
        OFFLINE: '#94a3b8',  
        STARVED: '#f97316',  
        WORKER: '#3b82f6',   
        STATION_BG: '#ffffff',
        STATION_STROKE: '#cbd5e1', 
        BUFFER_BG: '#f8fafc',      
        PART_BODY: '#fbbf24',    
        PART_BORDER: '#b45309',  
        ARROW_IDLE: '#000000',   
        ARROW_ACTIVE: '#16a34a', 
        WORKER_PATH: '#93c5fd',
        WORKER_ARROW: '#60a5fa' 
    };

    const getStationWidth = (capacity = 1) => {
        return (capacity * SLOT_WIDTH_FIXED) + (STATION_PADDING * 2);
    };

    // === 1. PRZYGOTOWANIE DANYCH ===
    const { stationTimelines, bufferTimelines, transportEvents, workerTravelEvents } = useMemo(() => {
        if (!simulationData || !simulationData.replayEvents) 
            return { stationTimelines: {}, bufferTimelines: {}, transportEvents: [], workerTravelEvents: [], ordersMap: {} };
        
        const events = simulationData.replayEvents.sort((a, b) => a.time - b.time);
        
        const sTimelines = {};
        config.stations.forEach(s => sTimelines[s.id] = []);
        events.filter(e => e.type === 'STATION_STATE').forEach(e => {
            if (sTimelines[e.stationId]) sTimelines[e.stationId].push({ time: e.time, status: e.status, meta: e.meta });
        });

        const bTimelines = {};
        config.buffers.forEach(b => bTimelines[b.id] = []);
        events.filter(e => e.type === 'BUFFER_STATE').forEach(e => {
             if (bTimelines[e.bufferId]) bTimelines[e.bufferId].push({ time: e.time, count: e.count, content: e.content || [] });
        });

        const tEvents = events.filter(e => e.type === 'TRANSPORT');
        const wEvents = events.filter(e => e.type === 'WORKER_TRAVEL');

        return { 
            replayEvents: events,
            stationTimelines: sTimelines,
            bufferTimelines: bTimelines,
            transportEvents: tEvents,
            workerTravelEvents: wEvents
        };
    }, [simulationData, config]);

    // === NOWE: Analiza interwałów pracy dla zleceń (Pre-processing) ===
    const orderWorkData = useMemo(() => {
        if (!simulationData || !simulationData.replayEvents) return { intervals: {}, totals: {} };

        const intervals = {}; // orderId -> [{start, end, duration}]
        const totals = {};    // orderId -> totalDuration

        simulationData.replayEvents.forEach(e => {
            if (e.type === 'STATION_STATE' && e.status === 'RUN' && e.meta && e.meta.order) {
                const orderId = e.meta.order;
                if (!intervals[orderId]) intervals[orderId] = [];
                if (!totals[orderId]) totals[orderId] = 0;

                const duration = e.meta.duration || (e.meta.endTime - e.meta.startTime);
                
                intervals[orderId].push({
                    start: e.meta.startTime,
                    end: e.meta.endTime,
                    duration: duration
                });
                totals[orderId] += duration;
            }
        });

        return { intervals, totals };
    }, [simulationData]);


    // === 2. LOGIKA CZASU ===
    const getShiftInfo = (timeHours) => {
        if (!simulationData?.shiftSettings) return { day: 1, hour: 0, shift: 'Domyślna', isWorking: true, dateStr: '' };
        const totalHours = timeHours;
        const dayIndex = Math.floor(totalHours / 24);
        const hourOfDay = totalHours % 24;
        const date = new Date(2025, 0, 1);
        date.setTime(date.getTime() + totalHours * 3600 * 1000); 
        const dateStr = date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
            if (endVal > startVal) { if (hourOfDay >= startVal && hourOfDay < endVal) inShift = true; } 
            else { if (hourOfDay >= startVal || hourOfDay < endVal) inShift = true; }
            if (inShift) { activeShiftName = `Zmiana ${key}`; isWorking = true; }
        });
        return { day: dayIndex + 1, hour: hourOfDay, shift: activeShiftName, isWorking, dateStr };
    };

    const jumpToNextDay = () => {
        const nextDayStart = (Math.floor(currentTimeVal / 24) + 1) * 24 + 6;
        setCurrentTimeVal(Math.min(nextDayStart, simulationData.duration));
    };

    useEffect(() => {
        if (!isPlaying) { cancelAnimationFrame(animationFrameRef.current); return; }
        const animate = (timestamp) => {
            if (!lastTimestampRef.current) lastTimestampRef.current = timestamp;
            const delta = timestamp - lastTimestampRef.current;
            const hourStep = (delta / 1000) * (playbackSpeed / 3600); 
            setCurrentTimeVal(prev => {
                const next = prev + hourStep;
                if (next >= (simulationData?.duration || 100)) { setIsPlaying(false); return simulationData?.duration || 100; }
                return next;
            });
            lastTimestampRef.current = timestamp;
            animationFrameRef.current = requestAnimationFrame(animate);
        };
        animationFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [isPlaying, playbackSpeed, simulationData]);

    // === HELPER: Wrapping Tekstu ===
    const getWrappedLines = (ctx, text, maxWidth) => {
        const words = text.split(' ');
        let lines = [];
        let currentLine = words[0];
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) { currentLine += " " + word; } 
            else { lines.push(currentLine); currentLine = word; }
        }
        lines.push(currentLine);
        return lines;
    };

    // === 3. RENDEROWANIE KANWY ===
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !config || !simulationData) return;
        const ctx = canvas.getContext('2d');
        
        const parent = canvas.parentElement;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        const { width, height } = canvas;
        
        ctx.fillStyle = "#f8fafc"; 
        ctx.fillRect(0, 0, width, height);
        
        ctx.save();
        ctx.translate(viewState.x, viewState.y);
        ctx.scale(viewState.zoom, viewState.zoom);

        // GRID
        ctx.strokeStyle = "#e2e8f0";
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

        // === PRE-KALKULACJA UKŁADU ===
        const nodeLayouts = new Map();
        const getLayout = (id) => nodeLayouts.get(id) || { x: 0, y: 0, width: 0, height: 0 };

        // 1a. Stacje i Bufory
        [...config.stations, ...config.buffers].forEach(node => {
            const isStation = !!node.type;
            const capacity = node.capacity || 1;
            
            ctx.font = "bold 11px Arial";
            
            const fixedBlockWidth = isStation 
                ? (capacity * SLOT_WIDTH_FIXED) + (STATION_PADDING * 2) 
                : 130; 
            
            const blockWidth = fixedBlockWidth;
            
            const iconSpace = 30; 
            const availableTextWidth = blockWidth - iconSpace - 10;
            const textLines = getWrappedLines(ctx, node.name, availableTextWidth);
            const lineHeight = 14;
            
            const headerHeight = Math.max(35, (textLines.length * lineHeight) + 20); 
            
            const slotAreaHeight = isStation ? 60 : 40; 
            const blockHeight = headerHeight + slotAreaHeight;
            const innerPadding = STATION_PADDING;
            const slotWidth = SLOT_WIDTH_FIXED;

            const textBlockHeight = textLines.length * lineHeight;
            const headerCenterY = node.y + (headerHeight / 2);
            const textStartY = headerCenterY - (textBlockHeight / 2);

            nodeLayouts.set(node.id, {
                x: node.x,
                y: node.y,
                width: blockWidth,
                height: blockHeight,
                headerHeight,
                slotWidth,
                innerPadding,
                textLines,
                lineHeight,
                textX: node.x + iconSpace + (availableTextWidth / 2),
                textY: textStartY
            });
        });

        // 1b. ZASOBY (PRACOWNICY)
        [...config.workerPools, ...(config.toolPools || [])].forEach(node => {
            nodeLayouts.set(node.id, {
                x: node.x,
                y: node.y,
                width: 60,
                height: 60,
                textX: node.x + 30, 
                textY: node.y + 70 
            });
        });

        // POŁĄCZENIA
        config.flows.forEach(flow => {
            const from = getLayout(flow.from);
            const to = getLayout(flow.to);
            if(from.width && to.width) drawFlowConnection(ctx, from, to, false, COLORS.ARROW_ACTIVE, COLORS.ARROW_IDLE);
        });

        if (config.workerFlows) {
            config.workerFlows.forEach(wf => {
                const from = getLayout(wf.from); 
                const to = getLayout(wf.to);     
                if (from.width && to.width) {
                    drawFlowConnection(ctx, from, to, false, COLORS.WORKER_ARROW, COLORS.WORKER_ARROW, true);
                }
            });
        }
        
        // --- LOGIKA STANU ---
        const currentStationStatus = {};
        const partsInProcess = []; 
        const currentBufferStatus = {};
        
        config.stations.forEach(s => {
            const layout = getLayout(s.id);
            const timeline = stationTimelines[s.id];
            const activeOps = timeline ? timeline.filter(e => e.status === 'RUN' && e.meta && e.meta.startTime <= currentTimeVal && e.meta.endTime > currentTimeVal) : [];
            let status = 'IDLE'; if (activeOps.length > 0) status = 'RUN';
            currentStationStatus[s.id] = status;
            
            activeOps.forEach(op => {
                const slotIdx = op.meta.slotIndex !== undefined ? op.meta.slotIndex : activeOps.indexOf(op);
                const slotX = layout.x + layout.innerPadding + (slotIdx * layout.slotWidth);
                const slotY = layout.y + layout.headerHeight; 
                
                partsInProcess.push({
                    orderId: op.meta.order || "?",
                    partCode: op.meta.part || "?",
                    subCode: op.meta.subCode || "?",
                    isAssembled: op.meta.isAssembled,
                    x: slotX + layout.slotWidth/2, 
                    y: slotY + 25, 
                    state: 'PROCESSING',
                    startTime: op.meta.startTime,
                    endTime: op.meta.endTime,
                    totalOps: op.meta.totalOps,
                    currentOp: op.meta.currentOp,
                    width: layout.slotWidth - (PART_MARGIN * 2) 
                });
            });
        });

        const bufferTableUpdate = {};
        config.buffers.forEach(b => {
            const timeline = bufferTimelines[b.id];
            let count = 0; let content = [];
            if (timeline && timeline.length > 0) {
                for (let i = timeline.length - 1; i >= 0; i--) {
                    if (timeline[i].time <= currentTimeVal) { count = timeline[i].count; content = timeline[i].content; break; }
                }
            }
            currentBufferStatus[b.id] = { count, content };
            bufferTableUpdate[b.id] = { name: b.name, count, content };
        });
        setBufferTableData(bufferTableUpdate);

        // --- RYSOWANIE OBIEKTÓW ---
        [...config.stations, ...config.buffers].forEach(node => {
            const isStation = !!node.type;
            const layout = getLayout(node.id);
            const status = isStation ? (currentStationStatus[node.id] || 'OFFLINE') : 'IDLE';
            let color = COLORS[status] || COLORS.OFFLINE;
            let bufferInfo = isStation ? null : currentBufferStatus[node.id];
            
            if (!isStation) {
                const fillRatio = bufferInfo.count / node.capacity;
                if (fillRatio > 0.8) color = COLORS.BLOCKED;
                else if (fillRatio > 0) color = COLORS.IDLE;
                else color = '#94a3b8';
            }

            if (status === 'RUN') { ctx.shadowBlur = 15; ctx.shadowColor = "rgba(34, 197, 94, 0.4)"; } 
            else { ctx.shadowBlur = 0; }

            ctx.fillStyle = isStation ? COLORS.STATION_BG : COLORS.BUFFER_BG;
            ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
            ctx.fillStyle = color;
            ctx.fillRect(layout.x, layout.y, layout.width, 6);
            ctx.lineWidth = 1;
            ctx.strokeStyle = COLORS.STATION_STROKE;
            ctx.strokeRect(layout.x, layout.y, layout.width, layout.height);
            ctx.shadowBlur = 0;
            
            // --- RYSOWANIE TEKSTU ---
            ctx.fillStyle = "#1e293b";
            ctx.font = "bold 11px Arial";
            ctx.textBaseline = "top"; 
            
            if (isStation) {
                const icon = status === 'RUN' ? '⚙️' : (status === 'BLOCKED' ? '🛑' : (status === 'OFFLINE' ? '⚠️' : '💤'));
                ctx.textAlign = "left";
                ctx.font = "14px Arial";
                ctx.fillText(icon, layout.x + 8, layout.y + 24 - 7); 

                ctx.textAlign = "center";
                ctx.font = "bold 11px Arial";
                layout.textLines.forEach((line, i) => {
                    ctx.fillText(line, layout.textX, layout.textY + (i * layout.lineHeight));
                });

                const cap = node.capacity || 1;
                ctx.strokeStyle = "#e2e8f0"; 
                ctx.lineWidth = 1;
                
                for(let i=0; i<cap; i++) {
                    const sx = layout.x + layout.innerPadding + (i * layout.slotWidth);
                    const sy = layout.y + layout.headerHeight;
                    const sh = 50; 
                    ctx.strokeRect(sx, sy, layout.slotWidth - 4, sh);
                    ctx.fillStyle = "#94a3b8"; ctx.font = "9px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
                    ctx.fillText(`#${i+1}`, sx + layout.slotWidth/2, sy + sh - 5);
                }

            } else {
                ctx.textAlign = "center";
                layout.textLines.forEach((line, i) => {
                    ctx.fillText(line, layout.x + layout.width/2, layout.textY + (i * layout.lineHeight));
                });
                ctx.font = "12px Arial"; ctx.fillStyle = "#64748b"; ctx.textBaseline = "alphabetic";
                const stateY = layout.y + layout.headerHeight + 5;
                ctx.fillText(`Stan: ${bufferInfo.count} / ${node.capacity}`, layout.x + layout.width/2, stateY + 10);
                const displayCount = Math.min(bufferInfo.count, 10);
                for(let i=0; i<displayCount; i++) { ctx.fillStyle = COLORS.PART_BODY; ctx.fillRect(layout.x + 10 + (i*8), stateY + 15, 6, 6); }
            }
            ctx.textBaseline = "alphabetic";
        });

        partsInProcess.forEach(part => {
            drawPartTile(ctx, part.x, part.y, part.orderId, part.partCode, part.subCode, part.isAssembled, COLORS.PART_BODY, {
                showProgress: true, startTime: part.startTime, endTime: part.endTime, currentTime: currentTimeVal, totalOps: part.totalOps, currentOp: part.currentOp, customWidth: part.width
            });
        });

        transportEvents.forEach(evt => {
            if (currentTimeVal >= evt.startTime && currentTimeVal <= evt.endTime) {
                const fromLayout = getLayout(evt.from); const toLayout = getLayout(evt.to);
                if (fromLayout.width && toLayout.width) {
                    const duration = evt.endTime - evt.startTime;
                    if (duration > 0) {
                        const progress = (currentTimeVal - evt.startTime) / duration;
                        const startX = fromLayout.x + fromLayout.width; const startY = fromLayout.y + 40;
                        const endX = toLayout.x; const endY = toLayout.y + 40;
                        const currentX = startX + (endX - startX) * progress;
                        const currentY = startY + (endY - startY) * progress;
                        drawFlowConnection(ctx, fromLayout, toLayout, true, COLORS.ARROW_ACTIVE, COLORS.ARROW_IDLE);
                        drawPartTile(ctx, currentX, currentY, evt.orderId, evt.partCode, evt.subCode, evt.isAssembled, COLORS.PART_BODY);
                    }
                }
            }
        });

        workerTravelEvents.forEach(evt => {
            if (currentTimeVal >= evt.startTime && currentTimeVal <= evt.endTime) {
                const fromLayout = getLayout(evt.from); const toLayout = getLayout(evt.to);
                if (fromLayout.width && toLayout.width) {
                    const duration = evt.endTime - evt.startTime;
                    if (duration > 0) {
                        const progress = (currentTimeVal - evt.startTime) / duration;
                        const startX = fromLayout.x + fromLayout.width/2; const startY = fromLayout.y + 40;
                        const endX = toLayout.x + toLayout.width/2; const endY = toLayout.y + 40;
                        const currentX = startX + (endX - startX) * progress;
                        const currentY = startY + (endY - startY) * progress;
                        ctx.save(); ctx.beginPath(); ctx.strokeStyle = COLORS.WORKER_PATH; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
                        ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke(); ctx.restore();
                        drawWorkerCircle(ctx, currentX, currentY, COLORS.WORKER);
                    }
                }
            }
        });

        // PRACOWNICY NA STACJACH
        const workersAtStations = {};
        config.stations.forEach(s => {
             if (currentStationStatus[s.id] === 'RUN') {
                 const workerFlow = config.workerFlows?.find(wf => wf.to === s.id);
                 if (workerFlow) {
                     const layout = getLayout(s.id);
                     drawWorkerCircle(ctx, layout.x + layout.width/2, layout.y + layout.height + 15, COLORS.WORKER);
                     if (!workersAtStations[workerFlow.from]) workersAtStations[workerFlow.from] = 0;
                     workersAtStations[workerFlow.from]++;
                 }
             }
        });

        config.workerPools.forEach(wp => {
            const layout = getLayout(wp.id);
            const busy = workersAtStations[wp.id] || 0;
            const free = wp.capacity - busy;
            ctx.fillStyle = "rgba(59, 130, 246, 0.05)"; ctx.strokeStyle = COLORS.WORKER; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.arc(layout.x + 30, layout.y + 30, 45, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = "#1e293b"; ctx.textAlign = "center"; ctx.font = "bold 10px Arial"; ctx.fillText(wp.name, layout.x + 30, layout.y + 15);
            ctx.font = "bold 14px Arial"; ctx.fillStyle = free > 0 ? "#22c55e" : "#ef4444"; ctx.fillText(`${free} / ${wp.capacity}`, layout.x + 30, layout.y + 35);
        });
        
        ctx.restore();
        updateSidebars();

    }, [config, simulationData, currentTimeVal, viewState, stationTimelines, bufferTimelines, transportEvents, workerTravelEvents]); 


    // === 4. SIDEBARY & UPDATE (LOGIKA POSTĘPU PRACY) ===
    const updateSidebars = () => {
        if (!simulationData?.orderReports) return;
        const info = getShiftInfo(currentTimeVal);
        setCurrentShiftInfo(info);

        // 1. Zidentyfikuj zlecenia FIZYCZNIE przetwarzane w tym momencie (do flagi isProcessing)
        const currentlyProcessingOrderIds = new Set();
        config.stations.forEach(s => {
            const timeline = stationTimelines[s.id];
            if (timeline) {
                const activeOps = timeline.filter(e => e.status === 'RUN' && e.meta && e.meta.startTime <= currentTimeVal && e.meta.endTime > currentTimeVal);
                activeOps.forEach(op => { if (op.meta.order) currentlyProcessingOrderIds.add(op.meta.order); });
            }
        });

        const active = [];
        const finished = [];

        simulationData.orderReports.forEach((o) => {
            if (currentTimeVal >= o.endTime) {
                finished.push(o);
            } else if (currentTimeVal >= o.startTime) {
                
                // === NOWA LOGIKA PCT: BAZUJĄCA NA WYKONANEJ PRACY ===
                const orderIntervals = orderWorkData.intervals[o.id] || [];
                const totalWorkRequired = orderWorkData.totals[o.id] || 1; // Unikamy dzielenia przez 0
                
                let completedWork = 0;
                orderIntervals.forEach(interval => {
                    if (currentTimeVal >= interval.end) {
                        // Praca zakończona w całości
                        completedWork += interval.duration;
                    } else if (currentTimeVal > interval.start) {
                        // Praca w toku - dodaj część
                        completedWork += (currentTimeVal - interval.start);
                    }
                    // Jeśli start > currentTimeVal, praca jeszcze się nie zaczęła, więc 0
                });

                const pct = Math.min(100, Math.max(0, (completedWork / totalWorkRequired) * 100));
                
                const isProcessing = currentlyProcessingOrderIds.has(o.id);
                
                active.push({ 
                    ...o, 
                    pct, 
                    renderedCode: o.code,
                    isProcessing: isProcessing 
                });
            }
        });
        
        setActiveOrders(active);
        setFinishedOrders(finished);
    };
    
    const drawPartTile = (ctx, x, y, orderId, partCode, subCode, isAssembled, color, extra = {}) => {
        const w = extra.customWidth || 90; 
        const h = 44; 
        
        ctx.save(); ctx.translate(x - w/2, y - h/2);
        ctx.shadowBlur = 4; ctx.shadowColor = "rgba(0,0,0,0.1)";
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); if (isAssembled) ctx.roundRect(0, 0, w, h, h/2); else ctx.roundRect(0, 0, w, h, 4); ctx.fill(); ctx.shadowBlur = 0;
        ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.stroke();
        ctx.fillStyle = color; if (isAssembled) { ctx.beginPath(); ctx.arc(10, h/2, 4, 0, Math.PI*2); ctx.fill(); } else { ctx.fillRect(0, 0, 6, h); }
        ctx.textAlign = "left";
        
        if (w > 60) {
            ctx.font = "9px Arial"; ctx.fillStyle = "#94a3b8"; ctx.fillText(`Zl: ${orderId}`, 10, 9);
            ctx.font = "bold 10px Arial"; ctx.fillStyle = "#1e293b"; ctx.fillText(`${partCode}`, 10, 20);
            ctx.font = "bold 11px Arial"; ctx.fillStyle = "#d97706"; ctx.fillText(`${subCode || '-'}`, 10, 31);
        } else {
            ctx.font = "bold 10px Arial"; ctx.fillStyle = "#1e293b"; ctx.fillText(`${subCode}`, 8, 22);
        }
        
        if (extra.showProgress && extra.totalOps) {
            const totalDur = extra.endTime - extra.startTime;
            const elapsed = extra.currentTime - extra.startTime;
            const pct = Math.min(1, Math.max(0, elapsed / totalDur));
            const barY = h - 4 - 2; 
            ctx.fillStyle = "#e2e8f0"; ctx.fillRect(2, barY, w - 4, 2);
            ctx.fillStyle = "#22c55e"; ctx.fillRect(2, barY, (w - 4) * pct, 2);
        }
        ctx.restore();
    };

    const drawWorkerCircle = (ctx, x, y, color) => {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 10px Arial"; ctx.textAlign = "center"; ctx.fillText("W", x, y + 3.5); ctx.restore();
    };

    const drawFlowConnection = (ctx, from, to, isActive, activeColor, idleColor, isWorker = false) => {
        const startX = from.x + from.width; 
        const startY = from.y + 40;
        const endX = to.x;
        const endY = to.y + 40;
        const midX = startX + (endX - startX) / 2;

        ctx.beginPath(); 
        ctx.strokeStyle = isActive ? activeColor : idleColor; 
        ctx.lineWidth = isActive ? 4 : 3;
        if (isWorker) { ctx.setLineDash([5, 5]); } else if (isActive) { ctx.setLineDash([6, 4]); } else { ctx.setLineDash([]); }
        
        ctx.moveTo(startX, startY); ctx.lineTo(midX, startY); ctx.lineTo(midX, endY); ctx.lineTo(endX, endY);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(endX, endY); ctx.lineTo(endX - 8, endY - 5); ctx.lineTo(endX - 8, endY + 5); ctx.fill();
    };

    const handleMouseDown = (e) => { setIsDragging(true); setLastMousePos({ x: e.clientX, y: e.clientY }); };
    const handleMouseMove = (e) => { if (!isDragging) return; const dx = e.clientX - lastMousePos.x; const dy = e.clientY - lastMousePos.y; setViewState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); setLastMousePos({ x: e.clientX, y: e.clientY }); };
    const handleMouseUp = () => setIsDragging(false);
    const handleWheel = (e) => { const scale = e.deltaY > 0 ? 0.9 : 1.1; setViewState(prev => ({ ...prev, zoom: Math.min(Math.max(0.5, prev.zoom * scale), 3) })); };
    const handleTimelineChange = (e) => { setCurrentTimeVal(parseFloat(e.target.value)); setIsPlaying(false); };

    const BufferTable = () => {
        const bufferIds = Object.keys(bufferTableData);
        if (bufferIds.length === 0) return <div className="p-4 text-center text-slate-400 text-xs">Brak danych buforów</div>;
        return (
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                        <tr><th className="p-2 pl-3">Bufor</th><th className="p-2 w-16 text-center">Ilość</th><th className="p-2">Zawartość</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {bufferIds.map(id => {
                            const buf = bufferTableData[id];
                            const grouped = {};
                            buf.content.forEach(item => { const key = `${item.orderId || '?'}__${item.code || '?'}`; if (!grouped[key]) grouped[key] = { count: 0, orderId: item.orderId, code: item.code }; grouped[key].count++; });
                            const contentStr = Object.values(grouped).map(g => `(${g.count}x) ${g.code}`).join(' | ');
                            return (
                                <tr key={id} className="hover:bg-slate-50">
                                    <td className="p-2 pl-3 font-medium text-slate-700">{buf.name}</td>
                                    <td className="p-2 text-center font-bold text-slate-800">{buf.count}</td>
                                    <td className="p-2 text-slate-500 break-all">{contentStr || '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="relative w-full h-[82vh] overflow-hidden bg-slate-50 rounded-xl border border-slate-200 shadow-card font-sans text-slate-900">
            <div className="absolute inset-0 z-0 bg-slate-50 cursor-move" ref={containerRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel}>
                 <canvas ref={canvasRef} className="block w-full h-full"/>
            </div>

            <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4">
                <div className="flex justify-between items-start pointer-events-auto">
                    <div className="bg-white/95 backdrop-blur-sm border border-slate-200 p-3 rounded-xl shadow-sm flex items-center gap-6">
                        <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center border border-blue-100"><Clock size={20}/></div>
                             <div>
                                 <span className="text-[10px] text-slate-400 uppercase font-bold block">Czas</span>
                                 <span className="text-sm font-bold text-slate-800 font-mono">{currentShiftInfo.dateStr}</span>
                             </div>
                        </div>
                        <div className="h-8 w-px bg-slate-100"></div>
                        <div>
                             <span className="text-[10px] text-slate-400 uppercase font-bold block">Zmiana</span>
                             <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${currentShiftInfo.isWorking ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                <span className="text-sm font-semibold text-slate-700">{currentShiftInfo.shift}</span>
                             </div>
                        </div>
                    </div>

                    <div className="bg-white/95 backdrop-blur-sm border border-slate-200 p-2 rounded-xl shadow-sm flex items-center gap-2">
                        <button onClick={() => setIsPlaying(!isPlaying)} className="w-10 h-10 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all">
                            {isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor" className="ml-1"/>}
                        </button>
                        <select value={playbackSpeed} onChange={e => setPlaybackSpeed(Number(e.target.value))} className="bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 py-2.5 px-2 rounded-lg border border-slate-200 outline-none cursor-pointer transition-colors">
                            {[1, 2, 5, 10, 20, 50, 100].map(x => <option key={x} value={x}>{x}x</option>)}
                        </select>
                        <button onClick={jumpToNextDay} className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-colors">
                            <SkipForward size={14}/> +1 Dzień
                        </button>
                    </div>

                    <div className="bg-white/95 backdrop-blur-sm border border-slate-200 p-2 rounded-xl shadow-sm flex items-center gap-2">
                        <button onClick={() => setViewState(p => ({...p, zoom: Math.max(0.5, p.zoom * 0.8)}))} className="p-2 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"><ZoomOut size={18}/></button>
                        <button onClick={() => setViewState({x:0, y:0, zoom:1})} className="p-2 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"><RotateCcw size={18}/></button>
                        <button onClick={() => setViewState(p => ({...p, zoom: Math.min(3, p.zoom * 1.2)}))} className="p-2 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"><ZoomIn size={18}/></button>
                    </div>
                </div>

                <div className="flex-1 flex justify-between items-stretch py-4 min-h-0 pointer-events-none">
                    <div className="w-64 flex flex-col pointer-events-auto">
                        <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col max-h-full">
                            <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                     <Package size={14} className="text-blue-600"/>
                                     <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">Aktywne</h3>
                                </div>
                                <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-md font-bold">{activeOrders.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                {activeOrders.map((order, i) => (
                                    <div key={i} className={`bg-white rounded-lg border p-2.5 shadow-sm transition-all ${order.isProcessing ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-100'}`}>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-slate-700">Zl: {order.id.replace(/\.$/, '')}</span>
                                            <div className="flex items-center gap-1">
                                                {order.isProcessing ? 
                                                    <Cog size={12} className="text-blue-500 animate-spin-slow"/> : 
                                                    <Hourglass size={12} className="text-amber-400"/>
                                                }
                                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 rounded">{order.size}</span>
                                            </div>
                                        </div>
                                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-300 ${order.isProcessing ? 'bg-blue-500' : 'bg-amber-400'}`} style={{width: `${order.pct}%`}}></div>
                                        </div>
                                        <div className="text-[9px] text-right mt-1 font-medium text-slate-400">
                                            {order.isProcessing ? 'W toku' : 'Oczekiwanie'}
                                        </div>
                                    </div>
                                ))}
                                {activeOrders.length === 0 && <div className="text-center text-slate-400 py-8 text-xs italic">Brak aktywnych</div>}
                            </div>
                        </div>
                    </div>

                    <div className="w-56 flex flex-col pointer-events-auto">
                         <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[50%] ml-auto">
                            <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                     <CheckCircle2 size={14} className="text-emerald-600"/>
                                     <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">Zakończone</h3>
                                </div>
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-md font-bold">{finishedOrders.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                {finishedOrders.map((order, i) => (
                                    <div key={i} className="bg-white p-2 rounded-lg border border-slate-100 text-xs flex justify-between items-center opacity-80">
                                        <span className="font-medium text-slate-600">{order.id}</span>
                                        <span className="font-mono font-bold text-emerald-600">{order.duration}h</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pointer-events-auto flex flex-col gap-2">
                    <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm p-3 flex items-center gap-4">
                        <span className="text-xs font-mono font-bold text-slate-500 w-12 text-right">{currentTimeVal.toFixed(2)}h</span>
                        <input type="range" min="0" max={simulationData?.duration || 100} step="0.01" value={currentTimeVal} onChange={handleTimelineChange} className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
                        <span className="text-xs font-mono font-bold text-slate-400 w-12">{(simulationData?.duration || 100).toFixed(0)}h</span>
                        <button 
                            onClick={() => setIsBufferPanelOpen(!isBufferPanelOpen)}
                            className={`p-2 rounded-lg border transition-all ${isBufferPanelOpen ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                            title="Pokaż/Ukryj Bufory"
                        >
                            {isBufferPanelOpen ? <PanelBottomClose size={18}/> : <PanelBottomOpen size={18}/>}
                        </button>
                    </div>

                    {isBufferPanelOpen && (
                        <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm h-48 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
                             <div className="p-2 px-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                                <Layers size={14} className="text-slate-400"/>
                                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Stan Buforów (Live)</h4>
                             </div>
                             <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <BufferTable />
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};