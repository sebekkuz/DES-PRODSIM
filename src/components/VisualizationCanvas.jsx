import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';

export const VisualizationCanvas = () => {
    const canvasRef = useRef(null);
    const { simulationConfig, updateConfigItem } = useApp();
    const { stations, buffers, flows, workerPools, workerFlows } = simulationConfig;
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [draggingNode, setDraggingNode] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const nodeWidth = 110;
    const nodeHeight = 70;

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
            ...stations.map(s => ({ ...s, type: 'station', icon: getIcon(s.type) })),
            ...buffers.map(b => ({ ...b, type: 'buffer', icon: getIcon(null, true) })),
            ...workerPools.map(wp => ({ ...wp, type: 'workerPool', icon: "👷" }))
        ];
    }, [stations, buffers, workerPools]);

    const drawCanvas = (ctx, canvas) => {
        const width = canvas.width;
        const height = canvas.height;
        ctx.fillStyle = "#f9f9f9";
        ctx.fillRect(0, 0, width, height);
        ctx.save();
        ctx.translate(viewOffset.x, viewOffset.y);
        ctx.scale(zoom, zoom);
        
        // Grid
        ctx.beginPath();
        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 1;
        const gridSize = 50;
        const startX = Math.floor(-viewOffset.x / zoom / gridSize) * gridSize;
        const startY = Math.floor(-viewOffset.y / zoom / gridSize) * gridSize;
        const endX = startX + (width / zoom) + gridSize;
        const endY = startY + (height / zoom) + gridSize;
        for (let x = startX; x < endX; x += gridSize) { ctx.moveTo(x, -10000); ctx.lineTo(x, 10000); }
        for (let y = startY; y < endY; y += gridSize) { ctx.moveTo(-10000, y); ctx.lineTo(10000, y); }
        ctx.stroke();

        const nodePositions = new Map();
        allNodes.forEach(n => nodePositions.set(n.id, n));

        const drawOrthogonalArrow = (fromX, fromY, toX, toY, color, dash, label) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash(dash || []);
            const midX = fromX + (toX - fromX) / 2;
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(midX, fromY);
            ctx.lineTo(midX, toY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
            const headlen = 8;
            ctx.beginPath();
            ctx.moveTo(toX, toY);
            if (fromX < toX) { ctx.lineTo(toX - headlen, toY - headlen/2); ctx.lineTo(toX - headlen, toY + headlen/2); } else { ctx.lineTo(toX + headlen, toY - headlen/2); ctx.lineTo(toX + headlen, toY + headlen/2); }
            ctx.fill();
            if (label) {
                const labelX = midX;
                const labelY = fromY + (toY - fromY) / 2;
                ctx.font = "10px Arial";
                const textWidth = ctx.measureText(label).width + 6;
                const textHeight = 14;
                ctx.fillStyle = "white";
                ctx.fillRect(labelX - textWidth/2, labelY - textHeight/2, textWidth, textHeight);
                ctx.lineWidth = 1;
                ctx.strokeRect(labelX - textWidth/2, labelY - textHeight/2, textWidth, textHeight);
                ctx.fillStyle = "black";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(label, labelX, labelY);
            }
        };

        flows.forEach(flow => {
            const fromNode = nodePositions.get(flow.from); const toNode = nodePositions.get(flow.to); if (!fromNode || !toNode) return;
            const startX = fromNode.x + nodeWidth; const startY = fromNode.y + nodeHeight / 2; const endX = toNode.x; const endY = toNode.y + nodeHeight / 2;
            drawOrthogonalArrow(startX, startY, endX, endY, "#6b7280", [], `${flow.distance}m`);
        });

        workerFlows.forEach(flow => {
            const fromNode = nodePositions.get(flow.from); const toNode = nodePositions.get(flow.to); if (!fromNode || !toNode) return;
            const startX = fromNode.x + nodeWidth / 2; const startY = fromNode.y + nodeHeight; const endX = toNode.x + nodeWidth / 2; const endY = toNode.y;
            ctx.beginPath(); ctx.strokeStyle = "#f59e0b"; ctx.setLineDash([5, 5]);
            const midY = startY + (endY - startY) / 2; ctx.moveTo(startX, startY); ctx.lineTo(startX, midY); ctx.lineTo(endX, midY); ctx.lineTo(endX, endY); ctx.stroke();
            ctx.fillStyle = "white"; ctx.fillRect(endX + 5, midY - 7, 30, 14); ctx.fillStyle = "black"; ctx.font = "9px Arial"; ctx.fillText(`${flow.distance}m`, endX + 20, midY);
        });

        const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
            const words = text.split(' '); let line = ''; let testLine = ''; let lineArray = [];
            for(let n = 0; n < words.length; n++) { testLine = line + words[n] + ' '; const metrics = ctx.measureText(testLine); const testWidth = metrics.width; if (testWidth > maxWidth && n > 0) { lineArray.push(line); line = words[n] + ' '; } else { line = testLine; } }
            lineArray.push(line);
            const totalHeight = lineArray.length * lineHeight; let startY = y - (totalHeight / 2) + (lineHeight / 1.5); 
            lineArray.forEach((l, i) => { ctx.fillText(l, x, startY + (i * lineHeight)); });
        };

        ctx.setLineDash([]);
        allNodes.forEach(node => {
            ctx.fillStyle = "white"; ctx.shadowBlur = 10; ctx.shadowColor = "rgba(0,0,0,0.1)";
            let borderColor = "#9ca3af";
            if (node.type === 'station') borderColor = "#3b82f6";
            else if (node.type === 'buffer') borderColor = node.isStartBuffer ? "#10b981" : (node.isEndBuffer ? "#ef4444" : "#eab308");
            else if (node.type === 'workerPool') borderColor = "#f59e0b";
            ctx.strokeStyle = borderColor; ctx.lineWidth = 2;
            ctx.fillRect(node.x, node.y, nodeWidth, nodeHeight); ctx.shadowBlur = 0; ctx.strokeRect(node.x, node.y, nodeWidth, nodeHeight);
            ctx.font = "16px Arial"; ctx.fillStyle = "black"; ctx.textAlign = "left"; ctx.fillText(node.icon, node.x + 5, node.y + 20);
            ctx.font = "bold 9px Arial"; ctx.fillStyle = borderColor; ctx.textAlign = "right";
            const typeLabel = node.type === 'station' ? node.type.toUpperCase() : (node.type === 'workerPool' ? "ZASÓB" : "BUFOR");
            ctx.fillText(typeLabel, node.x + nodeWidth - 5, node.y + 12);
            ctx.fillStyle = "black"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
            wrapText(ctx, node.name, node.x + nodeWidth / 2, node.y + nodeHeight / 2 + 5, nodeWidth - 10, 12);
            ctx.font = "9px Arial"; ctx.fillStyle = "gray"; const capText = `Cap: ${node.capacity}`; ctx.fillText(capText, node.x + nodeWidth / 2, node.y + nodeHeight - 5);
        });
        ctx.restore();
    };

    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const parent = canvas.parentElement;
        canvas.width = parent.clientWidth; canvas.height = parent.clientHeight;
        drawCanvas(ctx, canvas);
    }, [allNodes, flows, workerFlows, viewOffset, zoom]);

    const getMousePos = (e) => { const rect = canvasRef.current.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; return { x: (clientX - rect.left), y: (clientY - rect.top) }; };
    const getWorldPos = (screenPos) => { return { x: (screenPos.x - viewOffset.x) / zoom, y: (screenPos.y - viewOffset.y) / zoom }; };
    const isHittingNode = (worldPos, node) => { return worldPos.x > node.x && worldPos.x < node.x + nodeWidth && worldPos.y > node.y && worldPos.y < node.y + nodeHeight; };
    const handleMouseDown = (e) => { e.preventDefault(); const screenPos = getMousePos(e); const worldPos = getWorldPos(screenPos); const hitNode = [...allNodes].reverse().find(node => isHittingNode(worldPos, node)); if (hitNode) { setDraggingNode(hitNode); setDragOffset({ x: worldPos.x - hitNode.x, y: worldPos.y - hitNode.y }); } else { setIsPanning(true); } setLastMousePos(screenPos); };
    const handleMouseMove = (e) => { e.preventDefault(); const screenPos = getMousePos(e); if (draggingNode) { const worldPos = getWorldPos(screenPos); const newX = worldPos.x - dragOffset.x; const newY = worldPos.y - dragOffset.y; updateConfigItem(draggingNode.type, draggingNode.id, { x: newX, y: newY }); } else if (isPanning) { const dx = screenPos.x - lastMousePos.x; const dy = screenPos.y - lastMousePos.y; setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy })); } setLastMousePos(screenPos); };
    const handleMouseUp = (e) => { e.preventDefault(); setDraggingNode(null); setIsPanning(false); };
    const handleWheel = (e) => { e.preventDefault(); const scaleAmount = -e.deltaY * 0.001; const newZoom = Math.min(Math.max(0.5, zoom + scaleAmount), 3); setZoom(newZoom); };
    
    return ( <canvas id="visualization-canvas" ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp} ></canvas> );
};