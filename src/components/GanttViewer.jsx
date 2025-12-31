// gantt_viewer.js
'use strict';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    GanttChart, 
    ZoomIn, 
    ZoomOut, 
    ChevronLeft, 
    ChevronRight, 
    Layers, 
    Users, 
    CalendarClock,
    MousePointer2,
    MonitorPlay
} from 'lucide-react';

export const GanttViewer = ({ config, simulationData }) => {

    // === KONFIGURACJA WIDOKU ===
    const [viewMode, setViewMode] = useState('STATIONS'); // 'STATIONS' lub 'RESOURCES'
    const [zoom, setZoom] = useState(40); // Pixels per hour (domyślnie trochę szerzej)
    const [scrollX, setScrollX] = useState(0);
    const [hoveredBlock, setHoveredBlock] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    // Wymiary
    const HEADER_HEIGHT = 40;
    const SIDEBAR_WIDTH = 220;
    const ROW_HEIGHT_BASE = 50;

    // Kolory bloków
    const COLORS = {
        RUN: '#22c55e',      // Zielony
        IDLE: '#eab308',     // Żółty
        BLOCKED: '#ef4444',  // Czerwony
        OFFLINE: '#94a3b8',  // Szary (zmieniono z fioletu dla estetyki)
        PROCESSING: '#22c55e', // Praca zasobu
        TRANSPORT: '#3b82f6',  // Transport zasobu
        TRAVEL: '#93c5fd'      // Dojazd pracownika
    };

    const LEGEND_ITEMS = [
        { label: 'Praca / Proces', color: COLORS.RUN },
        { label: 'Oczekiwanie (Idle)', color: COLORS.IDLE },
        { label: 'Blokada', color: COLORS.BLOCKED },
        { label: 'Transport', color: COLORS.TRANSPORT },
        { label: 'Dojazd (Travel)', color: COLORS.TRAVEL },
        { label: 'Offline / Przerwa', color: COLORS.OFFLINE },
    ];

    // Helper: Parsowanie czasu "HH:MM" -> float
    const parseTimeStr = (str) => {
        if (!str) return 0;
        const [h, m] = str.split(':').map(Number);
        return h + m / 60;
    };

    // === 1. LOGIKA NAWIGACJI (SKOKI DO ZMIAN) ===
    const jumpToShift = (direction) => {
        if (!simulationData?.shiftSettings) return;
        
        const settings = simulationData.shiftSettings;
        const duration = simulationData.duration || 24;
        const shiftStarts = [];

        const days = Math.ceil(duration / 24);
        for (let d = 0; d <= days; d++) {
            Object.values(settings).forEach(shift => {
                if (!shift.active) return;
                const startH = parseTimeStr(shift.start);
                const time = d * 24 + startH;
                if (time <= duration) shiftStarts.push(time);
            });
        }
        shiftStarts.sort((a, b) => a - b);
        const uniqueStarts = [...new Set(shiftStarts)];

        const currentH = scrollX / zoom;
        let targetH = currentH;

        if (direction === 'next') {
            const next = uniqueStarts.find(t => t > currentH + 0.5);
            if (next !== undefined) targetH = next;
        } else {
            const prev = [...uniqueStarts].reverse().find(t => t < currentH - 0.5);
            if (prev !== undefined) targetH = prev;
            else targetH = 0;
        }

        setScrollX(targetH * zoom);
    };

    // === 2. PRZETWARZANIE DANYCH ===
    const { rows, maxTime } = useMemo(() => {
        if (!simulationData || !simulationData.replayEvents) return { rows: [], maxTime: 100 };

        const simEnd = simulationData.duration || 100;
        let processedRows = [];

        if (viewMode === 'STATIONS') {
            config.stations.forEach(s => {
                const intervals = [];
                const events = simulationData.replayEvents
                    .filter(e => e.type === 'STATION_STATE' && e.stationId === s.id)
                    .sort((a, b) => a.time - b.time);

                let activeState = null;
                events.forEach(evt => {
                    if (activeState) {
                        if (evt.time > activeState.startTime) {
                            intervals.push({
                                start: activeState.startTime,
                                end: evt.time,
                                duration: evt.time - activeState.startTime,
                                status: activeState.status,
                                meta: activeState.meta
                            });
                        }
                    }
                    activeState = { startTime: evt.time, status: evt.status, meta: evt.meta || {} };
                });
                if (activeState && activeState.startTime < simEnd) {
                    intervals.push({
                        start: activeState.startTime,
                        end: simEnd,
                        duration: simEnd - activeState.startTime,
                        status: activeState.status,
                        meta: activeState.meta
                    });
                }
                
                processedRows.push({
                    id: s.id,
                    name: s.name,
                    subTitle: s.type.toUpperCase(),
                    intervals: intervals,
                    height: ROW_HEIGHT_BASE
                });
            });

        } else {
            const allPools = [...config.workerPools, ...config.toolPools];
            allPools.forEach(pool => {
                const usageEvents = simulationData.replayEvents.filter(e => e.type === 'RESOURCE_USAGE' && e.poolId === pool.id);
                const travelEvents = simulationData.replayEvents.filter(e => e.type === 'WORKER_TRAVEL' && e.from === pool.id);

                let rawIntervals = [];
                
                usageEvents.forEach(e => {
                    rawIntervals.push({
                        start: e.startTime,
                        end: e.endTime,
                        duration: e.duration,
                        status: e.usageType === 'PROCESSING' ? 'PROCESSING' : 'TRANSPORT',
                        meta: e.meta || {}
                    });
                });

                travelEvents.forEach(e => {
                    rawIntervals.push({
                        start: e.startTime,
                        end: e.endTime,
                        duration: e.endTime - e.startTime,
                        status: 'TRAVEL',
                        meta: { to: e.to }
                    });
                });

                rawIntervals.sort((a, b) => a.start - b.start);

                const lanes = [];
                const packedIntervals = [];

                rawIntervals.forEach(interval => {
                    let assignedLane = -1;
                    for (let i = 0; i < lanes.length; i++) {
                        if (lanes[i] <= interval.start) {
                            assignedLane = i;
                            break;
                        }
                    }
                    if (assignedLane === -1) {
                        assignedLane = lanes.length;
                        lanes.push(0);
                    }
                    lanes[assignedLane] = interval.end;
                    packedIntervals.push({ ...interval, lane: assignedLane });
                });

                const laneCount = Math.max(1, lanes.length);
                const laneHeight = 20;
                const totalHeight = laneCount * laneHeight + 30;

                processedRows.push({
                    id: pool.id,
                    name: pool.name,
                    subTitle: `Cap: ${pool.capacity}`,
                    intervals: packedIntervals,
                    height: totalHeight,
                    isPool: true,
                    laneHeight: laneHeight
                });
            });
        }

        return { rows: processedRows, maxTime: simEnd };
    }, [simulationData, config, viewMode]);

    // === 3. RYSOWANIE (LIGHT MODE) ===
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const totalHeightContent = rows.reduce((acc, row) => acc + row.height, 0) + HEADER_HEIGHT;
        const containerHeight = containerRef.current?.clientHeight || 0;
        const canvasHeight = Math.max(totalHeightContent, containerHeight);
        const totalWidth = containerRef.current?.clientWidth || 0;
        
        const dpr = window.devicePixelRatio || 1;
        canvas.width = totalWidth * dpr;
        canvas.height = canvasHeight * dpr;
        canvas.style.width = `${totalWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
        ctx.scale(dpr, dpr);

        // TŁO: Białe (Light Mode)
        ctx.fillStyle = "#ffffff"; 
        ctx.fillRect(0, 0, totalWidth, canvasHeight);

        ctx.save();
        ctx.translate(SIDEBAR_WIDTH, HEADER_HEIGHT);
        
        // --- RYSOWANIE LINI ZMIAN ---
        if (simulationData?.shiftSettings) {
            const settings = simulationData.shiftSettings;
            const duration = simulationData.duration || 100;
            const days = Math.ceil(duration / 24);

            for (let d = 0; d <= days; d++) {
                Object.values(settings).forEach(shift => {
                    if (!shift.active) return;
                    
                    const startH = parseTimeStr(shift.start);
                    const endH = parseTimeStr(shift.end);
                    
                    let timeStart = d * 24 + startH;
                    let timeEnd = d * 24 + endH;
                    if (endH < startH) timeEnd += 24; 

                    const xStart = timeStart * zoom - scrollX;
                    const xEnd = timeEnd * zoom - scrollX;

                    // Start Zmiany (Zielony)
                    if (xStart >= -50 && xStart <= totalWidth) {
                        ctx.beginPath();
                        ctx.strokeStyle = "rgba(22, 163, 74, 0.4)"; // green-600
                        ctx.lineWidth = 2;
                        ctx.setLineDash([4, 4]);
                        ctx.moveTo(xStart, 0); ctx.lineTo(xStart, canvasHeight);
                        ctx.stroke();
                        
                        ctx.fillStyle = "rgba(22, 163, 74, 1)";
                        ctx.font = "bold 10px sans-serif";
                        ctx.textAlign = "left";
                        ctx.fillText("START", xStart + 4, 15);
                    }

                    // Koniec Zmiany (Czerwony)
                    if (xEnd >= -50 && xEnd <= totalWidth) {
                        ctx.beginPath();
                        ctx.strokeStyle = "rgba(220, 38, 38, 0.4)"; // red-600
                        ctx.lineWidth = 2;
                        ctx.setLineDash([4, 4]);
                        ctx.moveTo(xEnd, 0); ctx.lineTo(xEnd, canvasHeight);
                        ctx.stroke();

                        ctx.fillStyle = "rgba(220, 38, 38, 1)";
                        ctx.font = "bold 10px sans-serif";
                        ctx.textAlign = "right";
                        ctx.fillText("KONIEC", xEnd - 4, canvasHeight - 10);
                    }
                });
            }
            ctx.setLineDash([]);
        }

        // --- GRID GODZINOWY ---
        const visibleStart = scrollX / zoom;
        const visibleEnd = (scrollX + totalWidth - SIDEBAR_WIDTH) / zoom;
        
        ctx.strokeStyle = "#f1f5f9"; // slate-100 (bardzo delikatna siatka)
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let h = Math.floor(visibleStart); h <= Math.ceil(visibleEnd); h++) {
            const x = h * zoom - scrollX;
            ctx.moveTo(x, 0); ctx.lineTo(x, canvasHeight);
        }
        ctx.stroke();

        // --- WIERSZE DANYCH ---
        let currentY = 0;
        rows.forEach((row, idx) => {
            // Zebra striping (delikatny szary)
            if (idx % 2 === 0) {
                ctx.fillStyle = "#f8fafc"; // slate-50
                ctx.fillRect(-scrollX, currentY, Math.max(maxTime * zoom, totalWidth), row.height);
            }

            row.intervals.forEach(block => {
                if (block.end < visibleStart || block.start > visibleEnd) return;

                const x = block.start * zoom - scrollX;
                const w = Math.max(block.duration * zoom, 1);
                
                let y = currentY + 5;
                let h = row.height - 10;

                if (row.isPool) {
                    y = currentY + 20 + (block.lane * row.laneHeight);
                    h = row.laneHeight - 4;
                }

                ctx.fillStyle = COLORS[block.status] || '#cbd5e1';
                ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill(); // Zaokrąglone rogi

                // Tekst na bloku (jeśli się mieści)
                if (w > 25 && !row.isPool) {
                    ctx.fillStyle = "#ffffff"; 
                    ctx.font = "bold 10px sans-serif"; 
                    ctx.textAlign = "center";
                    const label = block.meta?.order ? `${block.meta.order}` : block.status;
                    ctx.fillText(label, x + w/2, y + h/2 + 3);
                }
            });

            // Linia podziału wierszy
            ctx.strokeStyle = "#e2e8f0"; // slate-200
            ctx.beginPath(); ctx.moveTo(-scrollX, currentY + row.height); ctx.lineTo(totalWidth, currentY + row.height); ctx.stroke();

            currentY += row.height;
        });
        
        ctx.restore();

        // --- LEWY SIDEBAR (Wewnątrz Canvas) ---
        ctx.save();
        // Tło nagłówków wierszy
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, SIDEBAR_WIDTH, canvasHeight);
        // Prawa krawędź sidebara
        ctx.strokeStyle = "#cbd5e1"; ctx.beginPath(); ctx.moveTo(SIDEBAR_WIDTH, 0); ctx.lineTo(SIDEBAR_WIDTH, canvasHeight); ctx.stroke();
        
        // Header Sidebara (lewy górny róg)
        ctx.fillStyle = "#f1f5f9"; ctx.fillRect(0, 0, SIDEBAR_WIDTH, HEADER_HEIGHT);
        ctx.fillStyle = "#475569"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(viewMode === 'STATIONS' ? "STACJA ROBOCZA" : "ZASÓB (PULA)", 15, 25);
        
        // Separator pod headerem
        ctx.strokeStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(0, HEADER_HEIGHT); ctx.lineTo(SIDEBAR_WIDTH, HEADER_HEIGHT); ctx.stroke();

        let sideY = HEADER_HEIGHT;
        rows.forEach(row => {
            // Nazwa wiersza
            ctx.fillStyle = "#334155"; ctx.font = "bold 11px sans-serif"; ctx.fillText(row.name, 15, sideY + 20);
            // Podtytuł
            ctx.fillStyle = "#94a3b8"; ctx.font = "10px sans-serif"; ctx.fillText(row.subTitle, 15, sideY + 35);
            // Linia separatora
            ctx.strokeStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(0, sideY + row.height); ctx.lineTo(SIDEBAR_WIDTH, sideY + row.height); ctx.stroke();
            sideY += row.height;
        });
        ctx.restore();

        // --- NAGŁÓWEK CZASU (Fixed Top) ---
        ctx.save();
        ctx.fillStyle = "#f8fafc"; // slate-50
        ctx.fillRect(SIDEBAR_WIDTH, 0, totalWidth - SIDEBAR_WIDTH, HEADER_HEIGHT);
        ctx.strokeStyle = "#cbd5e1"; ctx.beginPath(); ctx.moveTo(SIDEBAR_WIDTH, HEADER_HEIGHT); ctx.lineTo(totalWidth, HEADER_HEIGHT); ctx.stroke();

        ctx.fillStyle = "#64748b"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
        for (let h = Math.floor(visibleStart); h <= Math.ceil(visibleEnd); h++) {
            const x = SIDEBAR_WIDTH + (h * zoom) - scrollX;
            // Marker godziny
            ctx.fillText(`${h}:00`, x, 24);
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(x, HEADER_HEIGHT - 6, 1, 6);
            ctx.fillStyle = "#64748b"; // reset text color
        }
        ctx.restore();

    }, [rows, zoom, scrollX, viewMode, maxTime, simulationData.shiftSettings]);

    // === 4. INTERAKCJE MYSZY ===
    const handleMouseMove = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setMousePos({ x: e.clientX, y: e.clientY });

        if (x > SIDEBAR_WIDTH && y > HEADER_HEIGHT) {
            const graphX = x - SIDEBAR_WIDTH + scrollX;
            const graphY = y - HEADER_HEIGHT;
            let currentY = 0;
            let foundRow = null;
            for(const row of rows) {
                if (graphY >= currentY && graphY < currentY + row.height) { foundRow = row; break; }
                currentY += row.height;
            }

            if (foundRow) {
                const time = graphX / zoom;
                const block = foundRow.intervals.find(b => time >= b.start && time <= b.end);
                
                if (block && foundRow.isPool) {
                    const blockY = currentY + 20 + (block.lane * foundRow.laneHeight);
                    if (graphY < blockY || graphY > blockY + foundRow.laneHeight) {
                        setHoveredBlock(null); return;
                    }
                }

                if (block) {
                    setHoveredBlock({ ...block, rowName: foundRow.name });
                    return;
                }
            }
        }
        setHoveredBlock(null);
    };

    const handleWheel = (e) => {
        if (e.shiftKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom(prev => Math.min(Math.max(prev * delta, 1), 200));
        } else {
            setScrollX(prev => Math.max(0, prev + e.deltaY));
        }
    };

    return (
        // GŁÓWNY KONTENER - SPÓJNY Z INNYMI MODUŁAMI
        <div className="flex h-[82vh] gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-card font-sans text-slate-900 overflow-hidden">
            
            {/* PANEL STEROWANIA (SIDEBAR) */}
            <aside className="w-64 flex flex-col gap-4 bg-white rounded-xl shadow-sm border border-slate-200 p-4 shrink-0 overflow-y-auto custom-scrollbar">
                
                <div className="pb-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <GanttChart size={16} className="text-blue-600"/> Harmonogram
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Wizualizacja przebiegu w czasie</p>
                </div>

                {/* TRYB WIDOKU */}
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Tryb Wyświetlania</label>
                    <div className="flex flex-col gap-2">
                        <button 
                            onClick={() => setViewMode('STATIONS')}
                            className={`flex items-center p-2.5 rounded-lg border text-xs font-semibold transition-all ${viewMode === 'STATIONS' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                            <Layers size={14} className="mr-2"/> Stacje Robocze
                        </button>
                        <button 
                            onClick={() => setViewMode('RESOURCES')}
                            className={`flex items-center p-2.5 rounded-lg border text-xs font-semibold transition-all ${viewMode === 'RESOURCES' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                            <Users size={14} className="mr-2"/> Zasoby (Pule)
                        </button>
                    </div>
                </div>

                {/* NAWIGACJA ZMIAN */}
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Nawigacja Zmianowa</label>
                    <div className="flex gap-2">
                        <button onClick={() => jumpToShift('prev')} className="flex-1 flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-xs font-semibold transition-colors border border-slate-200">
                            <ChevronLeft size={14}/> Poprz.
                        </button>
                        <button onClick={() => jumpToShift('next')} className="flex-1 flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-xs font-semibold transition-colors border border-slate-200">
                            Nast. <ChevronRight size={14}/>
                        </button>
                    </div>
                </div>

                {/* ZOOM CONTROL */}
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Skala Czasu (Zoom)</label>
                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                        <button onClick={() => setZoom(z => Math.max(z * 0.8, 5))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600 transition-all"><ZoomOut size={14}/></button>
                        <span className="flex-1 text-center text-xs font-mono text-slate-600">{Math.round(zoom)} px/h</span>
                        <button onClick={() => setZoom(z => Math.min(z * 1.2, 200))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600 transition-all"><ZoomIn size={14}/></button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 text-center italic">Shift + Scroll aby przybliżyć</p>
                </div>

                {/* LEGENDA */}
                <div className="border-t border-slate-100 pt-4 mt-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Legenda</label>
                    <div className="space-y-1.5">
                        {LEGEND_ITEMS.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: item.color }}></span>
                                <span className="text-xs text-slate-600">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

            </aside>

            {/* GŁÓWNY OBSZAR CANVAS */}
            <main className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative" ref={containerRef}>
                <canvas 
                    ref={canvasRef}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoveredBlock(null)}
                    onWheel={handleWheel}
                    className="block cursor-crosshair"
                />

                {/* EMPTY STATE */}
                {rows.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 pointer-events-none">
                        <MonitorPlay size={48} className="opacity-20 mb-2"/>
                        <p className="text-sm font-medium">Brak danych do wyświetlenia.</p>
                        <p className="text-xs">Uruchom symulację, aby zobaczyć harmonogram.</p>
                    </div>
                )}

                {/* TOOLTIP (Przeniesiony na jasny styl) */}
                {hoveredBlock && (
                    <div 
                        className="fixed pointer-events-none z-50 bg-white/95 backdrop-blur-sm text-slate-800 p-3 rounded-lg shadow-xl border border-slate-200 text-xs animate-in fade-in zoom-in-95 duration-150" 
                        style={{ left: mousePos.x + 15, top: mousePos.y + 15, minWidth: '180px' }}
                    >
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                            <MousePointer2 size={12} className="text-blue-500"/>
                            <span className="font-bold text-slate-900">{hoveredBlock.rowName}</span>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between"><span className="text-slate-500">Typ:</span> <span className="font-semibold">{hoveredBlock.status}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Czas:</span> <span className="font-mono">{hoveredBlock.start.toFixed(2)}h - {hoveredBlock.end.toFixed(2)}h</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Trwanie:</span> <span className="font-mono font-bold text-slate-700">{hoveredBlock.duration.toFixed(2)}h</span></div>
                            {hoveredBlock.meta?.stationId && <div className="flex justify-between"><span className="text-slate-500">Stacja:</span> <span className="font-medium text-blue-600">{hoveredBlock.meta.stationId}</span></div>}
                            {hoveredBlock.lane !== undefined && <div className="flex justify-between"><span className="text-slate-500">Wątek:</span> <span className="font-medium">#{hoveredBlock.lane + 1}</span></div>}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};