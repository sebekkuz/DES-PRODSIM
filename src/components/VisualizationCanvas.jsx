import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

export const VisualizationCanvas = () => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    
    // 1. POBIERANIE DANYCH Z KONTEKSTU (Przywrócone)
    const { simulationConfig, updateConfigItem } = useApp();
    const stations = simulationConfig?.stations || [];
    const buffers = simulationConfig?.buffers || [];
    const flows = simulationConfig?.flows || [];
    const workerPools = simulationConfig?.workerPools || [];
    const workerFlows = simulationConfig?.workerFlows || [];

    // Stan widoku
    const [view, setView] = useState({ x: 0, y: 0, k: 1 });
    const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    
    // Stan przeciągania węzłów
    const [draggingNode, setDraggingNode] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const nodeWidth = 110;
    const nodeHeight = 70;

    // === 2. PRZYGOTOWANIE WĘZŁÓW ===
    const getIcon = (type, isBuffer = false) => {
        if (isBuffer) return "📥";
        switch (type) {
            case "podmontaz": return "🔧";
            case "montaz": return "🛠️";
            case "pakowanie": return "📦";
            case "jakosci": return "🔍";
            default: return "🏭";
        }
    };

    const allNodes = useMemo(() => {
        return [
            ...stations.map(s => ({ ...s, type: 'station', icon: getIcon(s.type), color: "#3b82f6" })),
            ...buffers.map(b => ({ ...b, type: 'buffer', icon: getIcon(null, true), color: b.isStartBuffer ? "#10b981" : (b.isEndBuffer ? "#ef4444" : "#eab308") })),
            ...workerPools.map(wp => ({ ...wp, type: 'workerPool', icon: "👷", color: "#f59e0b" }))
        ];
    }, [stations, buffers, workerPools]);

    // === 3. RYSOWANIE (Canvas) ===
    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;

        // Tło
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(view.x, view.y);
        ctx.scale(view.k, view.k);

        // Siatka
        drawGrid(ctx, view, width, height);

        const nodeMap = new Map(allNodes.map(n => [n.id, n]));

        // Połączenia (Flows)
        flows.forEach(flow => {
            const from = nodeMap.get(flow.from);
            const to = nodeMap.get(flow.to);
            if (from && to) drawArrow(ctx, from, to, "#64748b", false, `${flow.distance}m`);
        });

        // Połączenia Pracowników (Worker Flows)
        workerFlows.forEach(flow => {
            const from = nodeMap.get(flow.from);
            const to = nodeMap.get(flow.to);
            if (from && to) drawArrow(ctx, from, to, "#f59e0b", true, `${flow.distance}m`);
        });

        // Węzły
        allNodes.forEach(node => drawNode(ctx, node));

        ctx.restore();
    };

    // Helpery Rysowania
    const drawGrid = (ctx, view, w, h) => {
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1 / view.k;
        const gridSize = 50;
        
        // Optymalizacja: rysuj tylko widoczne linie
        const startX = Math.floor(-view.x / view.k / gridSize) * gridSize;
        const endX = startX + (w / view.k) + gridSize;
        const startY = Math.floor(-view.y / view.k / gridSize) * gridSize;
        const endY = startY + (h / view.k) + gridSize;

        ctx.beginPath();
        for (let x = startX; x < endX; x += gridSize) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
        for (let y = startY; y < endY; y += gridSize) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
        ctx.stroke();
    };

    const drawArrow = (ctx, from, to, color, dashed, label) => {
        const startX = from.x + nodeWidth / (dashed ? 2 : 1); 
        const startY = from.y + nodeHeight / (dashed ? 1 : 2);
        const endX = to.x + (dashed ? nodeWidth / 2 : 0);
        const endY = to.y + nodeHeight / (dashed ? 0 : 2);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash(dashed ? [5, 5] : []);
        
        // Orthogonal routing (proste kąty)
        const midX = startX + (endX - startX) / 2;
        const midY = startY + (endY - startY) / 2;

        ctx.moveTo(startX, startY);
        if (dashed) {
            ctx.lineTo(startX, midY); ctx.lineTo(endX, midY); ctx.lineTo(endX, endY);
        } else {
            ctx.lineTo(midX, startY); ctx.lineTo(midX, endY); ctx.lineTo(endX, endY);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Strzałka
        const head = 8;
        ctx.beginPath();
        ctx.fillStyle = color;
        if (dashed) {
             ctx.moveTo(endX, endY); ctx.lineTo(endX - head/2, endY - head); ctx.lineTo(endX + head/2, endY - head);
        } else {
             ctx.moveTo(endX, endY); ctx.lineTo(endX - head, endY - head/2); ctx.lineTo(endX - head, endY + head/2);
        }
        ctx.fill();

        // Etykieta
        if (label) {
            ctx.font = "10px Arial";
            const labelX = dashed ? endX + 15 : midX;
            const labelY = dashed ? midY : startY + (endY - startY) / 2;
            const width = ctx.measureText(label).width + 6;
            ctx.fillStyle = "white"; ctx.fillRect(labelX - width/2, labelY - 7, width, 14);
            ctx.fillStyle = "black"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(label, labelX, labelY);
        }
    };

    const drawNode = (ctx, node) => {
        ctx.fillStyle = "white";
        ctx.shadowColor = "rgba(0,0,0,0.1)"; ctx.shadowBlur = 10;
        ctx.fillRect(node.x, node.y, nodeWidth, nodeHeight);
        ctx.shadowBlur = 0;

        ctx.strokeStyle = node.color; ctx.lineWidth = 2;
        ctx.strokeRect(node.x, node.y, nodeWidth, nodeHeight);

        // Ikona
        ctx.font = "16px Arial"; ctx.fillStyle = "black"; ctx.textAlign = "left"; 
        ctx.fillText(node.icon, node.x + 8, node.y + 24);

        // Typ
        ctx.font = "bold 9px Arial"; ctx.fillStyle = node.color; ctx.textAlign = "right";
        ctx.fillText(node.type.toUpperCase(), node.x + nodeWidth - 6, node.y + 14);

        // Nazwa
        ctx.fillStyle = "#1e293b"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
        const name = node.name.length > 15 ? node.name.substring(0,13)+"..." : node.name;
        ctx.fillText(name, node.x + nodeWidth/2, node.y + nodeHeight/2 + 4);

        // Capacity
        ctx.fillStyle = "#94a3b8"; ctx.font = "9px Arial";
        ctx.fillText(`Cap: ${node.capacity}`, node.x + nodeWidth/2, node.y + nodeHeight - 6);
    };

    // === 4. OBSŁUGA ROZMIARU I RYSOWANIA ===
    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                canvasRef.current.width = containerRef.current.clientWidth;
                canvasRef.current.height = containerRef.current.clientHeight;
                draw();
            }
        };
        const observer = new ResizeObserver(handleResize);
        if (containerRef.current) observer.observe(containerRef.current);
        handleResize();
        return () => observer.disconnect();
    }, []);

    // Przerysuj gdy zmienią się dane lub widok
    useEffect(() => {
        draw();
    }, [allNodes, flows, workerFlows, view]);

    // === 5. OBSŁUGA ZDARZEŃ MYSZY (NAPRAWA PASSIVE LISTENER) ===
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e) => {
            e.preventDefault();
            const scale = -e.deltaY * 0.001;
            setView(v => ({ ...v, k: Math.min(Math.max(0.2, v.k + scale), 3) }));
        };

        // Dodajemy listener z flagą passive: false
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
    }, []);

    const getMousePos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const getWorldPos = (screenPos) => ({
        x: (screenPos.x - view.x) / view.k,
        y: (screenPos.y - view.y) / view.k
    });

    const handleMouseDown = (e) => {
        const screenPos = getMousePos(e);
        const worldPos = getWorldPos(screenPos);
        
        // Sprawdź czy kliknięto w węzeł (odwrócona kolejność dla z-index)
        const hitNode = [...allNodes].reverse().find(n => 
            worldPos.x >= n.x && worldPos.x <= n.x + nodeWidth &&
            worldPos.y >= n.y && worldPos.y <= n.y + nodeHeight
        );

        if (hitNode) {
            setDraggingNode(hitNode);
            setDragOffset({ x: worldPos.x - hitNode.x, y: worldPos.y - hitNode.y });
        } else {
            setIsDraggingCanvas(true);
        }
        setLastMousePos(screenPos);
    };

    const handleMouseMove = (e) => {
        const screenPos = getMousePos(e);
        
        if (draggingNode) {
            const worldPos = getWorldPos(screenPos);
            const newX = worldPos.x - dragOffset.x;
            const newY = worldPos.y - dragOffset.y;
            
            // Aktualizacja w czasie rzeczywistym
            updateConfigItem(draggingNode.type, draggingNode.id, { x: newX, y: newY });
        } else if (isDraggingCanvas) {
            const dx = screenPos.x - lastMousePos.x;
            const dy = screenPos.y - lastMousePos.y;
            setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }
        setLastMousePos(screenPos);
    };

    const handleMouseUp = () => {
        setDraggingNode(null);
        setIsDraggingCanvas(false);
    };

    return (
        <div className="w-full h-full relative bg-slate-50 overflow-hidden" ref={containerRef}>
            <canvas 
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="block cursor-move touch-none"
            />
        </div>
    );
};