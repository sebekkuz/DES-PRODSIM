import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AccordionItem, DualListBox } from './SharedComponents';
import { VisualizationCanvas } from './VisualizationCanvas';

// --- SUB-KOMPONENTY (Dla uproszczenia trzymane w jednym pliku) ---

const ModuleStation = () => {
    const { simulationConfig, addConfigItem, deleteConfigItem, updateConfigItem, db } = useApp();
    const { stations } = simulationConfig; const { functions, casings } = db;
    const [selectedStationId, setSelectedStationId] = useState(null);
    const [name, setName] = useState(""); 
    const stationTypes = ["podmontaz", "montaz", "jakosci", "pakowanie"]; 
    const [type, setType] = useState(stationTypes[0]); 
    const [capacity, setCapacity] = useState(1);
    const [variance, setVariance] = useState(0);
    const [failureProb, setFailureProb] = useState(0);
    const [allowedOps, setAllowedOps] = useState([]);
    const [filterSourceType, setFilterSourceType] = useState('functions'); 
    const [filterSelectedSize, setFilterSelectedSize] = useState(''); 
    const [filterSelectedKey, setFilterSelectedKey] = useState('');
    const isEditing = selectedStationId !== null;
    
    const resetForm = () => { setSelectedStationId(null); setName(""); setType(stationTypes[0]); setCapacity(1); setAllowedOps([]); setVariance(0); setFailureProb(0); };
    
    useEffect(() => { 
        if (isEditing) { 
            const station = stations.find(s => s.id === selectedStationId); 
            if (station) { 
                setName(station.name); setType(station.type); setCapacity(station.capacity || 1);
                setAllowedOps(station.allowedOps || []); setVariance(station.variance || 0); setFailureProb(station.failureProb || 0);
            } 
        } else { resetForm(); } 
    }, [selectedStationId, stations]);
    
    const filterSizes = useMemo(() => { const funcSizes = Object.keys(functions); const caseSizes = Object.keys(casings); return [...new Set([...funcSizes, ...caseSizes])].sort(); }, [functions, casings]);
    const filterKeys = useMemo(() => { if (!filterSelectedSize) return []; const source = (filterSourceType === 'functions') ? functions : casings; return Object.keys(source[filterSelectedSize] || {}).sort(); }, [filterSelectedSize, filterSourceType, functions, casings]);
    const availableOpsForFilter = useMemo(() => { if (!filterSelectedSize || !filterSelectedKey) return []; const source = (filterSourceType === 'functions') ? functions : casings; return source[filterSelectedSize]?.[filterSelectedKey] || []; }, [filterSelectedSize, filterSelectedKey, filterSourceType, functions, casings]);
    
    const handleAllowedOpsChange = (newOpsList) => { setAllowedOps(newOpsList); if (isEditing) { updateConfigItem("station", selectedStationId, { allowedOps: newOpsList }); } };
    const handleSubmit = (e) => { e.preventDefault(); if (!name || !type) return; const stationData = { name, type, capacity: parseInt(capacity) || 1, variance: parseFloat(variance) || 0, failureProb: parseFloat(failureProb) || 0, allowedOps }; if (isEditing) { updateConfigItem("station", selectedStationId, stationData); } else { const newId = addConfigItem("station", stationData); if (newId) { setSelectedStationId(newId); } } };
    const handleDelete = () => { if (isEditing) { if (confirm(`Czy na pewno chcesz usunąć stację "${name}"?`)) { deleteConfigItem("station", selectedStationId); resetForm(); } } };

    return (
        <div className="text-sm">
            <h5 className="text-xs font-semibold mb-2">Istniejące Stacje:</h5>
            <div className="space-y-2 max-h-40 overflow-y-auto p-1 mb-4 border rounded-md">
                {stations.length === 0 ? (<p className="text-xs text-gray-500 text-center">Brak stacji</p>) : (
                    stations.map(station => (
                        <button key={station.id} onClick={() => setSelectedStationId(station.id)} className={`w-full flex justify-between items-center p-2 rounded-lg border text-sm text-left ${selectedStationId === station.id ? 'bg-blue-100 border-blue-400' : 'bg-white'}`}>
                            <div><span className="font-medium">{station.name}</span><span className="ml-2 text-xs text-gray-600 bg-gray-100 p-1 rounded">{station.type} (Cap: {station.capacity || 1})</span></div>
                        </button>
                    ))
                )}
            </div>
            <button onClick={resetForm} className="w-full bg-green-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-green-600 mb-4">+ Dodaj Nową Stację</button>
            <hr className="my-4"/>
            <h4 className="font-semibold mb-3 text-gray-700">{isEditing ? `Edytuj: ${name}` : "Dodaj Nową Stację"}</h4>
            <form onSubmit={handleSubmit} className="mb-4 p-3 bg-gray-50 rounded-md space-y-3">
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Nazwa Stacji</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa stacji" className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Typ Stacji</label><select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">{stationTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Pojemność</label><input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"/></div>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-orange-50 p-2 rounded border border-orange-200">
                    <div><label className="block text-xs font-medium text-orange-800 mb-1">Zmienność Czasu (+/- %)</label><input type="number" min="0" max="100" value={variance} onChange={(e) => setVariance(e.target.value)} className="w-full p-1 border border-orange-300 rounded text-sm"/></div>
                    <div><label className="block text-xs font-medium text-orange-800 mb-1">Awaryjność (Szansa %)</label><input type="number" min="0" max="100" value={failureProb} onChange={(e) => setFailureProb(e.target.value)} className="w-full p-1 border border-orange-300 rounded text-sm"/></div>
                </div>
                <div>
                    <h5 className="text-xs font-semibold mb-2 pt-2">Dozwolone Operacje</h5>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                        <select value={filterSourceType} onChange={e => { setFilterSelectedSize(''); setFilterSelectedKey(''); setFilterSourceType(e.target.value); }} className="w-full p-1.5 border border-gray-300 rounded-lg text-xs bg-white"><option value="functions">Funkcje</option><option value="casings">Obudowy</option></select>
                        <select value={filterSelectedSize} onChange={e => { setFilterSelectedSize(e.target.value); setFilterSelectedKey(''); }} className="w-full p-1.5 border border-gray-300 rounded-lg text-xs bg-white"><option value="">Rozmiar</option>{filterSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
                        <select value={filterSelectedKey} onChange={e => setFilterSelectedKey(e.target.value)} className="w-full p-1.5 border border-gray-300 rounded-lg text-xs bg-white" disabled={!filterSelectedSize}><option value="">Klucz</option>{filterKeys.map(k => <option key={k} value={k}>{k}</option>)}</select>
                    </div>
                    <DualListBox title="Dostępne / Przypisane" options={availableOpsForFilter} selectedItems={allowedOps} onSelectionChange={handleAllowedOpsChange} height="150px" renderItem={(op) => `${op.name} (${op.time}h, ${op.operators} op.)`}/>
                </div>
                <div className="flex space-x-2 pt-2">
                    <button type="submit" className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-blue-600">{isEditing ? "Aktualizuj Stację" : "+ Dodaj Stację"}</button>
                    {isEditing && (<button type="button" onClick={handleDelete} className="bg-red-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-red-600">Usuń</button>)}
                </div>
            </form>
        </div>
    );
};

const ModuleBuffer = () => {
    const { simulationConfig, addConfigItem, deleteConfigItem, updateConfigItem, db } = useApp();
    const { buffers } = simulationConfig;
    const [selectedBufferId, setSelectedBufferId] = useState(null);
    const [name, setName] = useState("");
    const [capacity, setCapacity] = useState(10);
    const [isStartBuffer, setIsStartBuffer] = useState(false);
    const [isEndBuffer, setIsEndBuffer] = useState(false);
    const [allowedProductTypes, setAllowedProductTypes] = useState([]);
    const [filterSize, setFilterSize] = useState('');
    const isEditing = selectedBufferId !== null;
    
    const allProductTypesMemo = useMemo(() => {
        const allTypes = [];
        if (db.functions) Object.keys(db.functions).forEach(size => Object.keys(db.functions[size]).forEach(key => allTypes.push({ id: `functions_${size}_${key}`, name: `Funkcja: ${size}-${key}`, size: size })));
        if (db.casings) Object.keys(db.casings).forEach(size => Object.keys(db.casings[size]).forEach(key => allTypes.push({ id: `casings_${size}_${key}`, name: `Obudowa: ${size}-${key}`, size: size })));
        return allTypes.sort((a,b) => a.name.localeCompare(b.name));
    }, [db.functions, db.casings]);
    
    const allSizesMemo = useMemo(() => { const sizes = new Set(allProductTypesMemo.map(p => p.size)); return Array.from(sizes).sort(); }, [allProductTypesMemo]);
    const filteredProductTypesMemo = useMemo(() => { if (!filterSize) { return allProductTypesMemo; } return allProductTypesMemo.filter(p => p.size === filterSize); }, [allProductTypesMemo, filterSize]);
    const resetForm = () => { setSelectedBufferId(null); setName(""); setCapacity(10); setIsStartBuffer(false); setIsEndBuffer(false); setAllowedProductTypes([]); setFilterSize(''); };
    useEffect(() => { if (isEditing) { const buffer = buffers.find(b => b.id === selectedBufferId); if (buffer) { setName(buffer.name); setCapacity(buffer.capacity); setIsStartBuffer(buffer.isStartBuffer || false); setIsEndBuffer(buffer.isEndBuffer || false); setAllowedProductTypes(buffer.allowedProductTypes || []); } } else { resetForm(); } }, [selectedBufferId, buffers]);
    
    const handleSubmit = (e) => { e.preventDefault(); if (!name) return; const bufferData = { name, capacity: parseInt(capacity, 10) || 1, isStartBuffer, isEndBuffer, allowedProductTypes }; if (isEditing) { updateConfigItem("buffer", selectedBufferId, bufferData); } else { const newId = addConfigItem("buffer", bufferData); if (newId) { setSelectedBufferId(newId); } } };
    const handleDelete = () => { if (isEditing) { if (confirm(`Czy na pewno chcesz usunąć bufor "${name}"?`)) { deleteConfigItem("buffer", selectedBufferId); resetForm(); } } };
    const handleAllowedTypesChange = (newSelectedItems) => { const newIds = newSelectedItems.map(item => item.id); const otherIds = allowedProductTypes.filter(id => { const item = allProductTypesMemo.find(p => p.id === id); return item && item.size !== filterSize; }); setAllowedProductTypes([...new Set([...otherIds, ...newIds])]); if (isEditing) { updateConfigItem("buffer", selectedBufferId, { allowedProductTypes: [...new Set([...otherIds, ...newIds])] }); } };
    const selectedItemsForDualList = useMemo(() => { const selectedIds = new Set(allowedProductTypes); return allProductTypesMemo.filter(p => selectedIds.has(p.id)); }, [allProductTypesMemo, allowedProductTypes]);

    return (
        <div className="text-sm">
            <h5 className="text-xs font-semibold mb-2">Istniejące Bufory:</h5>
            <div className="space-y-2 max-h-40 overflow-y-auto p-1 mb-4 border rounded-md">
                {buffers.map(buffer => (
                    <button key={buffer.id} onClick={() => setSelectedBufferId(buffer.id)} className={`w-full flex justify-between items-center p-2 rounded-lg border text-sm text-left ${selectedBufferId === buffer.id ? 'bg-blue-100 border-blue-400' : 'bg-white'}`}>
                        <div><span className="font-medium">{buffer.name}</span><span className="ml-2 text-xs text-gray-600 bg-gray-100 p-1 rounded">Poj: {buffer.capacity}</span>{buffer.isStartBuffer && <span className="ml-2 text-xs text-green-600 bg-green-100 p-1 rounded">START</span>}{buffer.isEndBuffer && <span className="ml-2 text-xs text-red-600 bg-red-100 p-1 rounded">KONIEC</span>}</div>
                    </button>
                ))}
            </div>
            <button onClick={resetForm} className="w-full bg-green-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-green-600 mb-4">+ Dodaj Nowy Bufor</button>
            <hr className="my-4"/>
            <h4 className="font-semibold mb-3 text-gray-700">{isEditing ? `Edytuj: ${name}` : "Dodaj Nowy Bufor"}</h4>
            <form onSubmit={handleSubmit} className="mb-4 p-3 bg-gray-50 rounded-md space-y-3">
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Nazwa Buforu</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Pojemność</label><input type="number" value={capacity} min="1" onChange={(e) => setCapacity(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                <div className="space-y-2">
                     <label className="block text-xs font-medium text-gray-700 mb-1">Filtr Rozmiaru</label>
                     <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">-- Pokaż Wszystkie Rozmiary --</option>{allSizesMemo.map(size => (<option key={size} value={size}>{size}</option>))}</select>
                    <DualListBox title="Dozwolone Typy" options={filteredProductTypesMemo} selectedItems={selectedItemsForDualList} onSelectionChange={handleAllowedTypesChange} height="150px" renderItem={(item) => item.name}/>
                </div>
                <div className="flex space-x-4 pt-2">
                    <label className="flex items-center"><input type="checkbox" checked={isStartBuffer} onChange={e => { setIsStartBuffer(e.target.checked); if(e.target.checked) setIsEndBuffer(false); }} className="h-4 w-4"/><span className="ml-2">Startowy</span></label>
                    <label className="flex items-center"><input type="checkbox" checked={isEndBuffer} onChange={e => { setIsEndBuffer(e.target.checked); if(e.target.checked) setIsStartBuffer(false); }} className="h-4 w-4"/><span className="ml-2">Kończący</span></label>
                </div>
                <div className="flex space-x-2 pt-2">
                    <button type="submit" className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-blue-600">{isEditing ? "Aktualizuj" : "+ Dodaj"}</button>
                    {isEditing && (<button type="button" onClick={handleDelete} className="bg-red-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-red-600">Usuń</button>)}
                </div>
            </form>
        </div>
    );
};

const ModuleResources = () => {
    const { simulationConfig, addConfigItem, deleteConfigItem, updateConfigItem } = useApp();
    const { workerPools, toolPools } = simulationConfig;
    const [selectedWorkerPoolId, setSelectedWorkerPoolId] = useState(null);
    const [workerName, setWorkerName] = useState("");
    const [workerCapacity, setWorkerCapacity] = useState(5);
    const [workerSpeed, setWorkerSpeed] = useState(1.2);
    const [workerCost, setWorkerCost] = useState(50);
    const isEditingWorker = selectedWorkerPoolId !== null;
    const [selectedToolPoolId, setSelectedToolPoolId] = useState(null);
    const [toolName, setToolName] = useState("");
    const [toolCapacity, setToolCapacity] = useState(2);
    const [toolSpeed, setToolSpeed] = useState(0.8);
    const isEditingTool = selectedToolPoolId !== null;
    
    const resetWorkerForm = () => { setSelectedWorkerPoolId(null); setWorkerName(""); setWorkerCapacity(5); setWorkerSpeed(1.2); setWorkerCost(50); };
    useEffect(() => { if (isEditingWorker) { const pool = workerPools.find(p => p.id === selectedWorkerPoolId); if (pool) { setWorkerName(pool.name); setWorkerCapacity(pool.capacity); setWorkerSpeed(pool.speed); setWorkerCost(pool.costPerHour || 50); } } else { resetWorkerForm(); } }, [selectedWorkerPoolId, workerPools]);
    const handleWorkerSubmit = (e) => { e.preventDefault(); if (!workerName) return; const poolData = { name: workerName, capacity: parseInt(workerCapacity) || 1, speed: parseFloat(workerSpeed) || 1, costPerHour: parseFloat(workerCost) || 0 }; if (isEditingWorker) { updateConfigItem("workerPool", selectedWorkerPoolId, poolData); } else { const newId = addConfigItem("workerPool", poolData); if (newId) setSelectedWorkerPoolId(newId); } };
    const handleWorkerDelete = () => { if (isEditingWorker) { if (confirm(`Usuń pulę "${workerName}"?`)) { deleteConfigItem("workerPool", selectedWorkerPoolId); resetWorkerForm(); } } };

    const resetToolForm = () => { setSelectedToolPoolId(null); setToolName(""); setToolCapacity(2); setToolSpeed(0.8); };
    useEffect(() => { if (isEditingTool) { const pool = toolPools.find(p => p.id === selectedToolPoolId); if (pool) { setToolName(pool.name); setToolCapacity(pool.capacity); setToolSpeed(pool.speed); } } else { resetToolForm(); } }, [selectedToolPoolId, toolPools]);
    const handleToolSubmit = (e) => { e.preventDefault(); if (!toolName) return; const poolData = { name: toolName, capacity: parseInt(toolCapacity) || 1, speed: parseFloat(toolSpeed) || 1 }; if (isEditingTool) { updateConfigItem("toolPool", selectedToolPoolId, poolData); } else { const newId = addConfigItem("toolPool", poolData); if (newId) setSelectedToolPoolId(newId); } };
    const handleToolDelete = () => { if (isEditingTool) { if (confirm(`Usuń pulę "${toolName}"?`)) { deleteConfigItem("toolPool", selectedToolPoolId); resetToolForm(); } } };

    return (
        <div className="text-sm space-y-6">
            <div>
                <h4 className="font-semibold mb-3 text-gray-700">Zarządzaj Pulami Pracowników</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto p-1 mb-4 border rounded-md">
                        {workerPools.map(pool => (
                            <button key={pool.id} onClick={() => setSelectedWorkerPoolId(pool.id)} className={`w-full flex justify-between items-center p-2 rounded-lg border text-sm text-left ${selectedWorkerPoolId === pool.id ? 'bg-blue-100 border-blue-400' : 'bg-white'}`}>
                                <div><span className="font-medium">{pool.name}</span><span className="ml-2 text-xs text-gray-600 bg-gray-100 p-1 rounded">Ilość: {pool.capacity}</span></div>
                            </button>
                        ))}
                </div>
                <button onClick={resetWorkerForm} className="w-full bg-green-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-green-600 mb-4">+ Dodaj</button>
                <form onSubmit={handleWorkerSubmit} className="mb-4 p-3 bg-gray-50 rounded-md space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Nazwa</label><input type="text" value={workerName} onChange={(e) => setWorkerName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Ilość</label><input type="number" value={workerCapacity} min="1" onChange={(e) => setWorkerCapacity(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Prędkość</label><input type="number" value={workerSpeed} min="0.1" step="0.1" onChange={(e) => setWorkerSpeed(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Koszt</label><input type="number" value={workerCost} min="0" step="0.1" onChange={(e) => setWorkerCost(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                    </div>
                    <div className="flex space-x-2 pt-2">
                        <button type="submit" className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-blue-600">{isEditingWorker ? "Aktualizuj" : "+ Dodaj"}</button>
                        {isEditingWorker && (<button type="button" onClick={handleWorkerDelete} className="bg-red-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-red-600">Usuń</button>)}
                    </div>
                </form>
            </div>
            <hr />
            <div>
                <h4 className="font-semibold mb-3 text-gray-700">Zarządzaj Pulami Narzędzi</h4>
                 <div className="space-y-2 max-h-40 overflow-y-auto p-1 mb-4 border rounded-md">
                        {toolPools.map(pool => (
                            <button key={pool.id} onClick={() => setSelectedToolPoolId(pool.id)} className={`w-full flex justify-between items-center p-2 rounded-lg border text-sm text-left ${selectedToolPoolId === pool.id ? 'bg-blue-100 border-blue-400' : 'bg-white'}`}>
                                <div><span className="font-medium">{pool.name}</span><span className="ml-2 text-xs text-gray-600 bg-gray-100 p-1 rounded">Ilość: {pool.capacity}</span></div>
                            </button>
                        ))}
                </div>
                <button onClick={resetToolForm} className="w-full bg-green-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-green-600 mb-4">+ Dodaj</button>
                <form onSubmit={handleToolSubmit} className="mb-4 p-3 bg-gray-50 rounded-md space-y-3">
                     <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Nazwa</label><input type="text" value={toolName} onChange={(e) => setToolName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Ilość</label><input type="number" value={toolCapacity} min="1" onChange={(e) => setToolCapacity(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                    </div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Prędkość</label><input type="number" value={toolSpeed} min="0.1" step="0.1" onChange={(e) => setToolSpeed(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                    <div className="flex space-x-2 pt-2">
                        <button type="submit" className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-blue-600">{isEditingTool ? "Aktualizuj" : "+ Dodaj"}</button>
                        {isEditingTool && (<button type="button" onClick={handleToolDelete} className="bg-red-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-red-600">Usuń</button>)}
                    </div>
                </form>
            </div>
        </div>
    );
};

const ModuleFlows = () => {
    const { simulationConfig, addConfigItem, deleteConfigItem, updateConfigItem } = useApp();
    const { stations, buffers, workerPools, toolPools, flows, workerFlows } = simulationConfig;
    const [selectedFlowId, setSelectedFlowId] = useState(null);
    const [fromNode, setFromNode] = useState(""); 
    const [toNode, setToNode] = useState(""); 
    const [distance, setDistance] = useState(1);
    const isEditingFlow = selectedFlowId !== null;
    const allProductNodes = useMemo(() => {
        const s = stations.map(n => ({ id: n.id, name: `${n.name} (Stacja)` }));
        const b = buffers.map(n => ({ id: n.id, name: `${n.name} (Bufor)` }));
        return [...s, ...b].sort((a,b) => a.name.localeCompare(b.name));
    }, [stations, buffers]);
    const resetFlowForm = () => { setSelectedFlowId(null); setFromNode(""); setToNode(""); setDistance(1); };
    useEffect(() => { if (isEditingFlow) { const flow = flows.find(f => f.id === selectedFlowId); if (flow) { setFromNode(flow.from); setToNode(flow.to); setDistance(flow.distance); } } else { resetFlowForm(); } }, [selectedFlowId, flows]);
    const handleFlowSubmit = (e) => { e.preventDefault(); if (!fromNode || !toNode) return alert("Wybierz węzły."); if (fromNode === toNode) return alert("Błąd pętli."); const fromName = allProductNodes.find(n => n.id === fromNode).name; const toName = allProductNodes.find(n => n.id === toNode).name; const flowData = { from: fromNode, to: toNode, name: `${fromName} -> ${toName}`, distance: parseFloat(distance) || 1 }; if (isEditingFlow) { updateConfigItem("flow", selectedFlowId, flowData); } else { const newId = addConfigItem("flow", flowData); if (newId) setSelectedFlowId(newId); } };
    const handleFlowDelete = () => { if (isEditingFlow) { if (confirm(`Usuń trasę?`)) { deleteConfigItem("flow", selectedFlowId); resetFlowForm(); } } };
    
    const [selectedWorkerFlowId, setSelectedWorkerFlowId] = useState(null);
    const [fromWorkerNode, setFromWorkerNode] = useState(""); 
    const [toWorkerNode, setToWorkerNode] = useState(""); 
    const [workerDistance, setWorkerDistance] = useState(1);
    const isEditingWorkerFlow = selectedWorkerFlowId !== null;
    const resetWorkerFlowForm = () => { setSelectedWorkerFlowId(null); setFromWorkerNode(""); setToWorkerNode(""); setWorkerDistance(1); };
    useEffect(() => { if (isEditingWorkerFlow) { const flow = workerFlows.find(f => f.id === selectedWorkerFlowId); if (flow) { setFromWorkerNode(flow.from); setToWorkerNode(flow.to); setWorkerDistance(flow.distance); } } else { resetWorkerFlowForm(); } }, [selectedWorkerFlowId, workerFlows]);
    const handleWorkerFlowSubmit = (e) => { e.preventDefault(); if (!fromWorkerNode || !toWorkerNode) return alert("Wybierz pulę i stację."); const fromName = workerPools.find(n => n.id === fromWorkerNode).name; const toName = stations.find(n => n.id === toWorkerNode).name; const flowData = { from: fromWorkerNode, to: toWorkerNode, name: `${fromName} -> ${toName}`, distance: parseFloat(workerDistance) || 1 }; if (isEditingWorkerFlow) { updateConfigItem("workerFlow", selectedWorkerFlowId, flowData); } else { const newId = addConfigItem("workerFlow", flowData); if (newId) setSelectedWorkerFlowId(newId); } };
    const handleWorkerFlowDelete = () => { if (isEditingWorkerFlow) { if (confirm(`Usuń ścieżkę?`)) { deleteConfigItem("workerFlow", selectedWorkerFlowId); resetWorkerFlowForm(); } } };

    const [selectedToolPool, setSelectedToolPool] = useState("");
    const handleToolAssignmentChange = (newSelectedItems) => { if (!selectedToolPool) return; const assignedFlowIds = newSelectedItems.map(item => item.id); updateConfigItem("toolPool", selectedToolPool, { assignedFlows: assignedFlowIds }); };
    const assignedFlows = useMemo(() => { if (!selectedToolPool) return []; const pool = toolPools.find(p => p.id === selectedToolPool); const ids = new Set(pool?.assignedFlows || []); return flows.filter(f => ids.has(f.id)); }, [selectedToolPool, toolPools, flows]);

    return (
        <div className="text-sm space-y-6">
            <div>
                <h4 className="font-semibold mb-3 text-gray-700">1. Trasy Produktu</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto p-1 mb-4 border rounded-md">
                        {flows.map(flow => (
                             <button key={flow.id} onClick={() => setSelectedFlowId(flow.id)} className={`w-full flex justify-between items-center p-2 rounded-lg border text-sm text-left ${selectedFlowId === flow.id ? 'bg-blue-100 border-blue-400' : 'bg-white'}`}>
                                <div><span className="font-medium">{flow.name}</span><span className="ml-2 text-xs text-gray-600 bg-gray-100 p-1 rounded">{flow.distance} m</span></div>
                            </button>
                        ))}
                </div>
                <button onClick={resetFlowForm} className="w-full bg-green-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-green-600 mb-4">+ Dodaj</button>
                <form onSubmit={handleFlowSubmit} className="mb-4 p-3 bg-gray-50 rounded-md space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Skąd</label><select value={fromNode} onChange={(e) => setFromNode(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">-- Wybierz --</option>{allProductNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></div>
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Dokąd</label><select value={toNode} onChange={(e) => setToNode(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">-- Wybierz --</option>{allProductNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></div>
                    </div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Odległość</label><input type="number" value={distance} min="0.1" step="0.1" onChange={(e) => setDistance(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                    <div className="flex space-x-2 pt-2">
                        <button type="submit" className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-blue-600">{isEditingFlow ? "Aktualizuj" : "+ Dodaj"}</button>
                        {isEditingFlow && (<button type="button" onClick={handleFlowDelete} className="bg-red-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-red-600">Usuń</button>)}
                    </div>
                </form>
            </div>
            <hr />
            <div>
                <h4 className="font-semibold mb-3 text-gray-700">2. Ścieżki Pracownika</h4>
                 <div className="space-y-2 max-h-40 overflow-y-auto p-1 mb-4 border rounded-md">
                        {workerFlows.map(flow => {
                             const fromName = workerPools.find(wp => wp.id === flow.from)?.name || flow.from;
                             const toName = stations.find(s => s.id === flow.to)?.name || flow.to;
                             return (
                                 <button key={flow.id} onClick={() => setSelectedWorkerFlowId(flow.id)} className={`w-full flex justify-between items-center p-2 rounded-lg border text-sm text-left ${selectedWorkerFlowId === flow.id ? 'bg-blue-100 border-blue-400' : 'bg-white'}`}>
                                    <div><span className="font-medium">{fromName} → {toName}</span><span className="ml-2 text-xs text-gray-600 bg-gray-100 p-1 rounded">{flow.distance} m</span></div>
                                </button>
                            );
                        })}
                </div>
                <button onClick={resetWorkerFlowForm} className="w-full bg-green-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-green-600 mb-4">+ Dodaj</button>
                <form onSubmit={handleWorkerFlowSubmit} className="mb-4 p-3 bg-gray-50 rounded-md space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Skąd</label><select value={fromWorkerNode} onChange={(e) => setFromWorkerNode(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">-- Pula --</option>{workerPools.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></div>
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">Dokąd</label><select value={toWorkerNode} onChange={(e) => setToWorkerNode(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">-- Stacja --</option>{stations.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></div>
                    </div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Odległość</label><input type="number" value={workerDistance} min="0.1" step="0.1" onChange={(e) => setWorkerDistance(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm"/></div>
                    <div className="flex space-x-2 pt-2">
                        <button type="submit" className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-blue-600">{isEditingWorkerFlow ? "Aktualizuj" : "+ Dodaj"}</button>
                        {isEditingWorkerFlow && (<button type="button" onClick={handleWorkerFlowDelete} className="bg-red-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-red-600">Usuń</button>)}
                    </div>
                </form>
            </div>
            <hr />
            <div>
                <h4 className="font-semibold mb-3 text-gray-700">3. Przypisz Narzędzia</h4>
                <div className="p-3 bg-gray-50 rounded-md space-y-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Wybierz Pulę Narzędzi</label>
                    <select value={selectedToolPool} onChange={(e) => setSelectedToolPool(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">-- Wybierz pulę --</option>{toolPools.map(pool => <option key={pool.id} value={pool.id}>{pool.name}</option>)}</select>
                    {selectedToolPool && (
                        <DualListBox title="Dostępne Trasy / Przypisane" options={flows} selectedItems={assignedFlows} onSelectionChange={handleToolAssignmentChange} renderItem={(item) => item.name}/>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- GŁÓWNY KOMPONENT WIDOKU ---

export default function ModuleVisualization() { 
    const [openAccordion, setOpenAccordion] = useState('stations'); 
    return ( 
        <div className="flex flex-col md:flex-row h-full max-h-[85vh] gap-4"> 
            <div className="w-full md:w-1/3 bg-white rounded-lg shadow-lg overflow-y-auto"> 
                <h3 className="text-lg font-semibold mb-1 p-4">Konfiguracja Linii</h3> 
                <AccordionItem title="🏭 Stacje" id="stations" open={openAccordion} setOpen={setOpenAccordion}><ModuleStation /></AccordionItem> 
                <AccordionItem title="📦 Bufory" id="buffers" open={openAccordion} setOpen={setOpenAccordion}><ModuleBuffer /></AccordionItem> 
                <AccordionItem title="👥 Zasoby" id="resources" open={openAccordion} setOpen={setOpenAccordion}><ModuleResources /></AccordionItem> 
                <AccordionItem title="➡️ Przepływy" id="flows" open={openAccordion} setOpen={setOpenAccordion}><ModuleFlows /></AccordionItem> 
            </div> 
            <div className="flex-1 md:mt-0"> 
                <div className="bg-white p-4 rounded-lg shadow-lg h-full flex flex-col"> 
                    <h3 className="text-lg font-semibold mb-2 flex justify-between"><span>Podgląd Linii 2D</span> <span className="text-xs font-normal text-gray-500">Przesuń myszką, kółko = zoom</span></h3> 
                    <div className="flex-1 min-h-[400px]"> 
                        <VisualizationCanvas /> 
                    </div> 
                </div> 
            </div> 
        </div> 
    ); 
};