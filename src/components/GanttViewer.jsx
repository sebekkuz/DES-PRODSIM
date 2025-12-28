// gantt_viewer.js
'use strict';

import React, { useState, useEffect, useRef, useMemo } from 'react';

export const GanttViewer = ({ config, simulationData }) => {

    // === KONFIGURACJA WIDOKU ===
    const [viewMode, setViewMode] = useState('STATIONS'); // 'STATIONS' lub 'RESOURCES'
    const [zoom, setZoom] = useState(20); // Pixels per hour
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
        OFFLINE: '#6b21a8',  // Fioletowy
        PROCESSING: '#22c55e', // Praca zasobu
        TRANSPORT: '#3b82f6',  // Transport zasobu
        TRAVEL: '#93c5fd'      // Dojazd pracownika (Worker Travel)
    };

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

        // Generujemy wszystkie momenty startu zmian w czasie trwania symulacji
        const days = Math.ceil(duration / 24);
        for (let d = 0; d <= days; d++) {
            Object.values(settings).forEach(shift => {
                if (!shift.active) return;
                const startH = parseTimeStr(shift.start);
                const time = d * 24 + startH;
                if (time <= duration) shiftStarts.push(time);
            });
        }
        // Sortujemy rosnąco
        shiftStarts.sort((a, b) => a - b);
        // Usuwamy duplikaty (jeśli są)
        const uniqueStarts = [...new Set(shiftStarts)];

        const currentH = scrollX / zoom;
        let targetH = currentH;

        if (direction === 'next') {
            // Znajdź pierwszy start większy niż obecny czas (+ margines błędu)
            const next = uniqueStarts.find(t => t > currentH + 0.5);
            if (next !== undefined) targetH = next;
        } else {
            // Znajdź ostatni start mniejszy niż obecny czas
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
            // --- TRYB STACJE ---
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
            // --- TRYB ZASOBY ---
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

                // Lane Packing
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

    // === 3. RYSOWANIE ===
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

        // Tło
        ctx.fillStyle = "#1e293b"; 
        ctx.fillRect(0, 0, totalWidth, canvasHeight);

        ctx.save();
        ctx.translate(SIDEBAR_WIDTH, HEADER_HEIGHT);
        
        // --- RYSOWANIE LINI ZMIAN (Shift Markers) ---
        if (simulationData?.shiftSettings) {
            const settings = simulationData.shiftSettings;
            const duration = simulationData.duration || 100;
            const days = Math.ceil(duration / 24);

            for (let d = 0; d <= days; d++) {
                Object.values(settings).forEach(shift => {
                    if (!shift.active) return;
                    
                    const startH = parseTimeStr(shift.start);
                    const endH = parseTimeStr(shift.end);
                    
                    // Czas startu w symulacji
                    const timeStart = d * 24 + startH;
                    const xStart = timeStart * zoom - scrollX;

                    // Czas końca (obsługa zmiany nocnej)
                    let timeEnd = d * 24 + endH;
                    if (endH < startH) timeEnd += 24; 
                    const xEnd = timeEnd * zoom - scrollX;

                    // Rysuj Start (Zielony przerywany)
                    if (xStart >= -50 && xStart <= totalWidth) {
                        ctx.beginPath();
                        ctx.strokeStyle = "rgba(74, 222, 128, 0.4)";
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 5]);
                        ctx.moveTo(xStart, 0);
                        ctx.lineTo(xStart, canvasHeight);
                        ctx.stroke();
                        
                        ctx.fillStyle = "rgba(74, 222, 128, 0.8)";
                        ctx.font = "10px Arial";
                        ctx.textAlign = "left";
                        ctx.fillText("START", xStart + 4, 15);
                    }

                    // Rysuj Koniec (Czerwony przerywany)
                    if (xEnd >= -50 && xEnd <= totalWidth) {
                        ctx.beginPath();
                        ctx.strokeStyle = "rgba(248, 113, 113, 0.4)";
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 5]);
                        ctx.moveTo(xEnd, 0);
                        ctx.lineTo(xEnd, canvasHeight);
                        ctx.stroke();

                        ctx.fillStyle = "rgba(248, 113, 113, 0.8)";
                        ctx.font = "10px Arial";
                        ctx.textAlign = "right";
                        ctx.fillText("KONIEC", xEnd - 4, canvasHeight - 10);
                    }
                });
            }
            ctx.setLineDash([]); // Reset
        }

        // Grid godzinowy
        const visibleStart = scrollX / zoom;
        const visibleEnd = (scrollX + totalWidth - SIDEBAR_WIDTH) / zoom;
        
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let h = Math.floor(visibleStart); h <= Math.ceil(visibleEnd); h++) {
            const x = h * zoom - scrollX;
            ctx.moveTo(x, 0); ctx.lineTo(x, canvasHeight);
        }
        ctx.stroke();

        // Rysowanie Wierszy
        let currentY = 0;
        rows.forEach((row, idx) => {
            if (idx % 2 === 0) {
                ctx.fillStyle = "rgba(255,255,255,0.02)";
                ctx.fillRect(-scrollX, currentY, maxTime * zoom, row.height);
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

                ctx.fillStyle = COLORS[block.status] || '#888';
                ctx.beginPath(); ctx.roundRect(x, y, w, h, 2); ctx.fill();

                if (w > 20 && !row.isPool) {
                    ctx.fillStyle = "#fff"; ctx.font = "10px Arial"; ctx.textAlign = "center";
                    const label = block.meta?.order ? `${block.meta.order}` : block.status;
                    ctx.fillText(label, x + w/2, y + h/2 + 3);
                }
            });

            ctx.strokeStyle = "#475569";
            ctx.beginPath(); ctx.moveTo(-scrollX, currentY + row.height); ctx.lineTo(totalWidth, currentY + row.height); ctx.stroke();

            currentY += row.height;
        });
        
        ctx.restore();

        // --- SIDEBAR (Fixed Left) ---
        ctx.save();
        ctx.fillStyle = "#1e293b"; ctx.fillRect(0, 0, SIDEBAR_WIDTH, canvasHeight);
        ctx.strokeStyle = "#475569"; ctx.beginPath(); ctx.moveTo(SIDEBAR_WIDTH, 0); ctx.lineTo(SIDEBAR_WIDTH, canvasHeight); ctx.stroke();

        ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, SIDEBAR_WIDTH, HEADER_HEIGHT);
        ctx.fillStyle = "#fff"; ctx.font = "bold 12px Arial"; ctx.textAlign = "left";
        ctx.fillText(viewMode === 'STATIONS' ? "STACJA ROBOCZA" : "ZASÓB (PULA)", 10, 25);

        let sideY = HEADER_HEIGHT;
        rows.forEach(row => {
            ctx.fillStyle = "#e2e8f0"; ctx.font = "bold 11px Arial"; ctx.fillText(row.name, 10, sideY + 20);
            ctx.fillStyle = "#64748b"; ctx.font = "10px Arial"; ctx.fillText(row.subTitle, 10, sideY + 35);
            ctx.strokeStyle = "#334155"; ctx.beginPath(); ctx.moveTo(0, sideY + row.height); ctx.lineTo(SIDEBAR_WIDTH, sideY + row.height); ctx.stroke();
            sideY += row.height;
        });
        ctx.restore();

        // --- TIMELINE HEADER (Fixed Top) ---
        ctx.save();
        ctx.fillStyle = "#0f172a"; ctx.fillRect(SIDEBAR_WIDTH, 0, totalWidth - SIDEBAR_WIDTH, HEADER_HEIGHT);
        ctx.beginPath(); ctx.moveTo(SIDEBAR_WIDTH, HEADER_HEIGHT); ctx.lineTo(totalWidth, HEADER_HEIGHT); ctx.stroke();

        ctx.fillStyle = "#94a3b8"; ctx.font = "11px Arial"; ctx.textAlign = "center";
        for (let h = Math.floor(visibleStart); h <= Math.ceil(visibleEnd); h++) {
            const x = SIDEBAR_WIDTH + (h * zoom) - scrollX;
            ctx.fillText(`${h}h`, x, 25);
            ctx.fillRect(x, HEADER_HEIGHT - 5, 1, 5);
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
        <div className="flex flex-col h-full bg-gray-900 text-white overflow-hidden">
            {/* TOOLBAR */}
            <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 shadow-md shrink-0">
                <div className="flex items-center space-x-4">
                    <span className="text-sm font-bold text-gray-300">📊 Harmonogram</span>
                    
                    {/* PRZYCISKI WIDOKU */}
                    <div className="flex bg-gray-700 rounded p-1">
                        <button onClick={() => setViewMode('STATIONS')} className={`px-3 py-1 text-xs rounded ${viewMode==='STATIONS' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Stacje</button>
                        <button onClick={() => setViewMode('RESOURCES')} className={`px-3 py-1 text-xs rounded ${viewMode==='RESOURCES' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Zasoby</button>
                    </div>

                    {/* NOWE: NAWIGACJA ZMIANOWA */}
                    <div className="flex bg-gray-700 rounded p-1 space-x-1">
                        <button onClick={() => jumpToShift('prev')} className="px-3 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-white">⏮ Poprz. Zmiana</button>
                        <button onClick={() => jumpToShift('next')} className="px-3 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-white">Nast. Zmiana ⏭</button>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <button onClick={() => setZoom(z => Math.max(z * 0.8, 1))} className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600">-</button>
                    <span className="text-xs font-mono w-12 text-center">{Math.round(zoom)} px/h</span>
                    <button onClick={() => setZoom(z => Math.min(z * 1.2, 200))} className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600">+</button>
                </div>
            </div>

            {/* CANVAS */}
            <div className="flex-1 relative overflow-hidden" ref={containerRef}>
                <canvas 
                    ref={canvasRef}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoveredBlock(null)}
                    onWheel={handleWheel}
                    className="cursor-crosshair block"
                />

                {/* TOOLTIP */}
                {hoveredBlock && (
                    <div className="fixed pointer-events-none z-50 bg-white text-gray-800 p-3 rounded shadow-xl border border-gray-200 text-xs" style={{ left: mousePos.x + 15, top: mousePos.y + 15 }}>
                        <div className="font-bold text-blue-600 border-b pb-1 mb-1">{hoveredBlock.rowName}</div>
                        <div><span className="font-semibold">Typ:</span> {hoveredBlock.status}</div>
                        <div><span className="font-semibold">Czas:</span> {hoveredBlock.start.toFixed(2)}h - {hoveredBlock.end.toFixed(2)}h</div>
                        <div><span className="font-semibold">Trwanie:</span> {hoveredBlock.duration.toFixed(2)}h</div>
                        {hoveredBlock.meta?.stationId && <div><span className="font-semibold">Stacja:</span> {hoveredBlock.meta.stationId}</div>}
                        {hoveredBlock.lane !== undefined && <div><span className="font-semibold">Wątek:</span> #{hoveredBlock.lane + 1}</div>}
                    </div>
                )}
            </div>
        </div>
    );
};