import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DualListBox } from './SharedComponents';
import { VisualizationCanvas } from './VisualizationCanvas';
import { 
  Factory, 
  Box, 
  Users, 
  ArrowRightLeft, 
  Plus, 
  Trash2, 
  Save, 
  Settings2,
  Cpu,
  MousePointer2,
  ChevronRight,
  ChevronLeft, // Import ikony powrotu
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2
} from 'lucide-react';

// --- SUB-KOMPONENTY (LOGIKA BIZNESOWA 100% ORYGINALNA) ---

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
    
    // UI State
    const [isFormVisible, setIsFormVisible] = useState(false);
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
    const handleDelete = () => { if (isEditing) { if (confirm(`Czy na pewno chcesz usunąć stację "${name}"?`)) { deleteConfigItem("station", selectedStationId); resetForm(); setIsFormVisible(false); } } };

    // Handlery UI
    const handleAddNewClick = () => { resetForm(); setIsFormVisible(true); };
    const handleTileClick = (id) => { setSelectedStationId(id); setIsFormVisible(true); };
    const handleCloseForm = () => { setIsFormVisible(false); resetForm(); };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header Sekcji */}
            <div className="h-14 border-b border-slate-100 flex items-center justify-between px-5 shrink-0 bg-white">
                <div className="flex items-center gap-2">
                    {/* PRZYCISK POWROTU (NOWY) */}
                    {isFormVisible && (
                        <button 
                            onClick={handleCloseForm}
                            className="p-1 -ml-2 mr-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Powrót do listy"
                        >
                            <ChevronLeft size={20} />
                        </button>
                    )}

                    <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                        {isFormVisible 
                            ? (isEditing ? <><Settings2 size={16} className="text-blue-600"/> Edycja</> : <><Plus size={16} className="text-emerald-600"/> Dodawanie</>)
                            : <><Factory size={16} className="text-blue-500"/> Stacje Robocze</>
                        }
                    </h2>
                </div>

                {isFormVisible && (
                    <button onClick={handleCloseForm} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={18} />
                    </button>
                )}
            </div>

            {/* Treść */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50">
                {!isFormVisible ? (
                    <div className="space-y-2">
                         {stations.length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
                                <p className="text-sm text-slate-400 font-medium">Brak stacji</p>
                            </div>
                        ) : (
                            stations.map(station => (
                                <button key={station.id} onClick={() => handleTileClick(station.id)} className="group w-full flex items-center p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all text-left">
                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mr-3 shrink-0 bg-blue-50 text-blue-600">
                                        <Factory size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="font-semibold text-sm block truncate text-slate-700 group-hover:text-blue-700">{station.name}</span>
                                        <span className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                            <span className="capitalize">{station.type}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                            <span>Cap: {station.capacity}</span>
                                        </span>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500" />
                                </button>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="space-y-5 px-1 pb-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nazwa</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Montaż Silnika" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"/>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Typ</label>
                                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                                    {stationTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Pojemność</label>
                                <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"/>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Zmienność %</label>
                                <input type="number" min="0" max="100" value={variance} onChange={(e) => setVariance(e.target.value)} className="w-full p-1.5 border border-slate-200 rounded text-sm bg-slate-50"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Awaryjność %</label>
                                <input type="number" min="0" max="100" value={failureProb} onChange={(e) => setFailureProb(e.target.value)} className="w-full p-1.5 border border-slate-200 rounded text-sm bg-slate-50"/>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Operacje</label>
                            <div className="grid grid-cols-3 gap-2 mb-2">
                                <select value={filterSourceType} onChange={e => { setFilterSelectedSize(''); setFilterSelectedKey(''); setFilterSourceType(e.target.value); }} className="w-full p-1.5 border border-slate-300 rounded text-[10px] bg-white"><option value="functions">Funkcje</option><option value="casings">Obudowy</option></select>
                                <select value={filterSelectedSize} onChange={e => { setFilterSelectedSize(e.target.value); setFilterSelectedKey(''); }} className="w-full p-1.5 border border-slate-300 rounded text-[10px] bg-white"><option value="">Rozmiar</option>{filterSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
                                <select value={filterSelectedKey} onChange={e => setFilterSelectedKey(e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-[10px] bg-white" disabled={!filterSelectedSize}><option value="">Klucz</option>{filterKeys.map(k => <option key={k} value={k}>{k}</option>)}</select>
                            </div>
                            <DualListBox options={availableOpsForFilter} selectedItems={allowedOps} onSelectionChange={handleAllowedOpsChange} height="160px" renderItem={(op) => op.name}/>
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky Footer */}
            <div className="p-4 border-t border-slate-100 bg-white z-10 shrink-0">
                {!isFormVisible ? (
                    <button onClick={handleAddNewClick} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-4 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm">
                        <Plus size={18} /> Dodaj Stanowisko
                    </button>
                ) : (
                    <div className="flex gap-3">
                         {isEditing && (
                            <button type="button" onClick={handleDelete} className="px-4 py-3 bg-white text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                                <Trash2 size={20} />
                            </button>
                        )}
                        <button onClick={handleSubmit} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-4 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm">
                            <Save size={18} /> {isEditing ? "Zapisz Zmiany" : "Utwórz"}
                        </button>
                    </div>
                )}
            </div>
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
    
    // UI State
    const [isFormVisible, setIsFormVisible] = useState(false);
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
    const handleDelete = () => { if (isEditing) { if (confirm(`Czy na pewno chcesz usunąć bufor "${name}"?`)) { deleteConfigItem("buffer", selectedBufferId); resetForm(); setIsFormVisible(false); } } };
    const handleAllowedTypesChange = (newSelectedItems) => { const newIds = newSelectedItems.map(item => item.id); const otherIds = allowedProductTypes.filter(id => { const item = allProductTypesMemo.find(p => p.id === id); return item && item.size !== filterSize; }); setAllowedProductTypes([...new Set([...otherIds, ...newIds])]); if (isEditing) { updateConfigItem("buffer", selectedBufferId, { allowedProductTypes: [...new Set([...otherIds, ...newIds])] }); } };
    const selectedItemsForDualList = useMemo(() => { const selectedIds = new Set(allowedProductTypes); return allProductTypesMemo.filter(p => selectedIds.has(p.id)); }, [allProductTypesMemo, allowedProductTypes]);

    const handleAddNewClick = () => { resetForm(); setIsFormVisible(true); };
    const handleTileClick = (id) => { setSelectedBufferId(id); setIsFormVisible(true); };
    const handleCloseForm = () => { setIsFormVisible(false); resetForm(); };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="h-14 border-b border-slate-100 flex items-center justify-between px-5 shrink-0 bg-white">
                <div className="flex items-center gap-2">
                    {/* PRZYCISK POWROTU */}
                    {isFormVisible && (
                        <button 
                            onClick={handleCloseForm}
                            className="p-1 -ml-2 mr-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Powrót"
                        >
                            <ChevronLeft size={20} />
                        </button>
                    )}
                    <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                        {isFormVisible 
                            ? (isEditing ? <><Settings2 size={16} className="text-orange-600"/> Edycja</> : <><Plus size={16} className="text-emerald-600"/> Dodawanie</>)
                            : <><Box size={16} className="text-orange-500"/> Bufory</>
                        }
                    </h2>
                </div>
                {isFormVisible && (
                    <button onClick={handleCloseForm} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={18} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50">
                {!isFormVisible ? (
                    <div className="space-y-2">
                         {buffers.length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
                                <p className="text-sm text-slate-400 font-medium">Brak buforów</p>
                            </div>
                        ) : (
                            buffers.map(buffer => (
                                <button key={buffer.id} onClick={() => handleTileClick(buffer.id)} className="group w-full flex items-center p-3.5 rounded-xl border border-slate-200 bg-white hover:border-orange-400 hover:shadow-md transition-all text-left">
                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mr-3 shrink-0 bg-orange-50 text-orange-600">
                                        <Box size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="font-semibold text-sm block truncate text-slate-700 group-hover:text-orange-700">{buffer.name}</span>
                                        <span className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                            <span>Cap: {buffer.capacity}</span>
                                            {buffer.isStartBuffer && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1 rounded">START</span>}
                                            {buffer.isEndBuffer && <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-100 px-1 rounded">KONIEC</span>}
                                        </span>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-300 group-hover:text-orange-500" />
                                </button>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="space-y-5 px-1 pb-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nazwa</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white"/>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Pojemność</label>
                            <input type="number" value={capacity} min="1" onChange={(e) => setCapacity(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white"/>
                        </div>
                        
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Filtr Typów</label>
                            <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"><option value="">-- Wszystkie --</option>{allSizesMemo.map(size => (<option key={size} value={size}>{size}</option>))}</select>
                            <DualListBox options={filteredProductTypesMemo} selectedItems={selectedItemsForDualList} onSelectionChange={handleAllowedTypesChange} height="160px" renderItem={(item) => item.name}/>
                        </div>
                        
                        <div className="flex gap-4 pt-1">
                            <label className="flex items-center"><input type="checkbox" checked={isStartBuffer} onChange={e => { setIsStartBuffer(e.target.checked); if(e.target.checked) setIsEndBuffer(false); }} className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"/><span className="ml-2 text-xs font-bold text-slate-600">Startowy</span></label>
                            <label className="flex items-center"><input type="checkbox" checked={isEndBuffer} onChange={e => { setIsEndBuffer(e.target.checked); if(e.target.checked) setIsStartBuffer(false); }} className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"/><span className="ml-2 text-xs font-bold text-slate-600">Końcowy</span></label>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white z-10 shrink-0">
                {!isFormVisible ? (
                     <button onClick={handleAddNewClick} className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white py-3 px-4 rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-sm">
                        <Plus size={18} /> Dodaj Bufor
                    </button>
                ) : (
                    <div className="flex gap-3">
                         {isEditing && (
                             <button type="button" onClick={handleDelete} className="px-4 py-3 bg-white text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                                <Trash2 size={20} />
                            </button>
                        )}
                        <button onClick={handleSubmit} className="flex-1 flex items-center justify-center gap-2 bg-orange-500 text-white py-3 px-4 rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-sm">
                            <Save size={18} /> {isEditing ? "Zapisz" : "Utwórz"}
                        </button>
                    </div>
                )}
            </div>
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
    
    // UI States
    const [isWorkerFormVisible, setIsWorkerFormVisible] = useState(false);
    const [isToolFormVisible, setIsToolFormVisible] = useState(false);

    const resetWorkerForm = () => { setSelectedWorkerPoolId(null); setWorkerName(""); setWorkerCapacity(5); setWorkerSpeed(1.2); setWorkerCost(50); };
    useEffect(() => { if (isEditingWorker) { const pool = workerPools.find(p => p.id === selectedWorkerPoolId); if (pool) { setWorkerName(pool.name); setWorkerCapacity(pool.capacity); setWorkerSpeed(pool.speed); setWorkerCost(pool.costPerHour || 50); } } else { resetWorkerForm(); } }, [selectedWorkerPoolId, workerPools]);
    const handleWorkerSubmit = (e) => { e.preventDefault(); if (!workerName) return; const poolData = { name: workerName, capacity: parseInt(workerCapacity) || 1, speed: parseFloat(workerSpeed) || 1, costPerHour: parseFloat(workerCost) || 0 }; if (isEditingWorker) { updateConfigItem("workerPool", selectedWorkerPoolId, poolData); } else { const newId = addConfigItem("workerPool", poolData); if (newId) setSelectedWorkerPoolId(newId); } };
    const handleWorkerDelete = () => { if (isEditingWorker) { if (confirm(`Usuń pulę "${workerName}"?`)) { deleteConfigItem("workerPool", selectedWorkerPoolId); resetWorkerForm(); setIsWorkerFormVisible(false); } } };

    const resetToolForm = () => { setSelectedToolPoolId(null); setToolName(""); setToolCapacity(2); setToolSpeed(0.8); };
    useEffect(() => { if (isEditingTool) { const pool = toolPools.find(p => p.id === selectedToolPoolId); if (pool) { setToolName(pool.name); setToolCapacity(pool.capacity); setToolSpeed(pool.speed); } } else { resetToolForm(); } }, [selectedToolPoolId, toolPools]);
    const handleToolSubmit = (e) => { e.preventDefault(); if (!toolName) return; const poolData = { name: toolName, capacity: parseInt(toolCapacity) || 1, speed: parseFloat(toolSpeed) || 1 }; if (isEditingTool) { updateConfigItem("toolPool", selectedToolPoolId, poolData); } else { const newId = addConfigItem("toolPool", poolData); if (newId) setSelectedToolPoolId(newId); } };
    const handleToolDelete = () => { if (isEditingTool) { if (confirm(`Usuń pulę "${toolName}"?`)) { deleteConfigItem("toolPool", selectedToolPoolId); resetToolForm(); setIsToolFormVisible(false); } } };

    return (
        <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-1 pb-4 bg-white p-4">
            
            {/* SEKCJA PRACOWNIKÓW */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Users size={14}/> Pracownicy</h5>
                    <button onClick={() => { resetWorkerForm(); setIsWorkerFormVisible(!isWorkerFormVisible); }} className="text-xs text-blue-600 hover:text-blue-800 font-bold bg-blue-50 px-2 py-1 rounded">
                        {isWorkerFormVisible ? 'Anuluj' : '+ Nowa Pula'}
                    </button>
                </div>
                
                {isWorkerFormVisible && (
                    <form onSubmit={handleWorkerSubmit} className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in slide-in-from-top-2 relative">
                        {/* PRZYCISK POWROTU DLA ZASOBÓW */}
                        <button 
                            type="button"
                            onClick={() => { setIsWorkerFormVisible(false); resetWorkerForm(); }}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
                        >
                            <X size={16} />
                        </button>

                        <div className="flex justify-between items-center mb-2">
                             <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                <ChevronLeft size={16} className="text-slate-400 cursor-pointer hover:text-blue-600" onClick={() => setIsWorkerFormVisible(false)}/>
                                {isEditingWorker ? 'Edytuj Pulę' : 'Nowa Pula'}
                             </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="text" placeholder="Nazwa" value={workerName} onChange={(e) => setWorkerName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"/>
                            <input type="number" placeholder="Ilość" value={workerCapacity} min="1" onChange={(e) => setWorkerCapacity(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"/>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="number" placeholder="Prędkość" value={workerSpeed} min="0.1" step="0.1" onChange={(e) => setWorkerSpeed(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"/>
                            <input type="number" placeholder="Koszt" value={workerCost} min="0" step="0.1" onChange={(e) => setWorkerCost(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"/>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700">{isEditingWorker ? "Zapisz" : "Dodaj"}</button>
                            {isEditingWorker && (<button type="button" onClick={handleWorkerDelete} className="bg-white text-red-600 border border-red-200 py-2 px-3 rounded-lg text-xs hover:bg-red-50"><Trash2 size={14}/></button>)}
                        </div>
                    </form>
                )}

                <div className="space-y-2">
                    {workerPools.map(pool => (
                        <button key={pool.id} onClick={() => { setSelectedWorkerPoolId(pool.id); setIsWorkerFormVisible(true); }} className={`w-full flex justify-between items-center p-3 rounded-xl border text-sm text-left transition-all ${selectedWorkerPoolId === pool.id && isWorkerFormVisible ? 'bg-blue-50 border-blue-400' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">{pool.name}</span>
                            </div>
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">{pool.capacity} os.</span>
                        </button>
                    ))}
                </div>
            </div>
            
            {/* SEKCJA NARZĘDZI */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Settings2 size={14}/> Narzędzia</h5>
                    <button onClick={() => { resetToolForm(); setIsToolFormVisible(!isToolFormVisible); }} className="text-xs text-orange-600 hover:text-orange-800 font-bold bg-orange-50 px-2 py-1 rounded">
                         {isToolFormVisible ? 'Anuluj' : '+ Nowe'}
                    </button>
                </div>

                {isToolFormVisible && (
                    <form onSubmit={handleToolSubmit} className="mb-4 p-4 bg-slate-50 rounded-xl border border-orange-200 space-y-3 animate-in fade-in slide-in-from-top-2 relative">
                         <button 
                            type="button"
                            onClick={() => { setIsToolFormVisible(false); resetToolForm(); }}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
                        >
                            <X size={16} />
                        </button>

                        <div className="flex justify-between items-center mb-2">
                             <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                <ChevronLeft size={16} className="text-slate-400 cursor-pointer hover:text-orange-600" onClick={() => setIsToolFormVisible(false)}/>
                                {isEditingTool ? 'Edytuj Pulę' : 'Nowe Narzędzie'}
                             </span>
                        </div>
                         <div className="grid grid-cols-2 gap-2">
                            <input type="text" placeholder="Nazwa" value={toolName} onChange={(e) => setToolName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"/>
                            <input type="number" placeholder="Ilość" value={toolCapacity} min="1" onChange={(e) => setToolCapacity(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"/>
                        </div>
                        <input type="number" placeholder="Prędkość" value={toolSpeed} min="0.1" step="0.1" onChange={(e) => setToolSpeed(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"/>
                        <div className="flex gap-2 pt-1">
                            <button type="submit" className="flex-1 bg-orange-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-orange-700">{isEditingTool ? "Zapisz" : "Dodaj"}</button>
                            {isEditingTool && (<button type="button" onClick={handleToolDelete} className="bg-white text-red-600 border border-red-200 py-2 px-3 rounded-lg text-xs hover:bg-red-50"><Trash2 size={14}/></button>)}
                        </div>
                    </form>
                )}

                 <div className="space-y-2">
                    {toolPools.map(pool => (
                        <button key={pool.id} onClick={() => { setSelectedToolPoolId(pool.id); setIsToolFormVisible(true); }} className={`w-full flex justify-between items-center p-3 rounded-xl border text-sm text-left transition-all ${selectedToolPoolId === pool.id && isToolFormVisible ? 'bg-orange-50 border-orange-400' : 'bg-white border-slate-200 hover:border-orange-300'}`}>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">{pool.name}</span>
                            </div>
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">{pool.capacity} szt.</span>
                        </button>
                    ))}
                </div>
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
        <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-1 pb-4 bg-white p-4">
            
            {/* 1. TRASY PRODUKTU */}
            <div className="mb-6">
                 <div className="flex items-center justify-between mb-2">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trasy Produktu</h5>
                    <button onClick={resetFlowForm} className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1"><Plus size={12}/> Nowa</button>
                </div>
                
                 <form onSubmit={handleFlowSubmit} className="p-3 bg-white rounded-lg border border-slate-200 space-y-2 mb-3 shadow-sm">
                    <div className="grid grid-cols-2 gap-2">
                        <select value={fromNode} onChange={(e) => setFromNode(e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white"><option value="">Skąd</option>{allProductNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
                        <select value={toNode} onChange={(e) => setToNode(e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white"><option value="">Dokąd</option>{allProductNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
                    </div>
                    <div className="flex gap-2">
                         <input type="number" placeholder="Dystans" value={distance} min="0.1" step="0.1" onChange={(e) => setDistance(e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-sm"/>
                         <button type="submit" className="flex-1 bg-blue-600 text-white py-1.5 rounded text-xs font-semibold hover:bg-blue-700">{isEditingFlow ? "Zapisz" : "Dodaj"}</button>
                        {isEditingFlow && (<button type="button" onClick={handleFlowDelete} className="bg-white text-red-600 border border-red-200 py-1.5 px-2 rounded text-xs hover:bg-red-50"><Trash2 size={14}/></button>)}
                    </div>
                </form>

                <div className="space-y-2 mb-3">
                        {flows.map(flow => (
                             <button key={flow.id} onClick={() => setSelectedFlowId(flow.id)} className={`w-full flex justify-between items-center p-2 rounded-lg border text-sm text-left transition-all ${selectedFlowId === flow.id ? 'bg-blue-50 border-blue-400' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
                                <div className="flex items-center gap-2"><ArrowRightLeft size={14} className="text-slate-400"/> <span className="font-medium text-slate-700">{flow.name}</span></div>
                                <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{flow.distance}m</span>
                            </button>
                        ))}
                </div>
            </div>
            
            <hr className="mb-6 border-slate-200"/>
            
            {/* 2. ŚCIEŻKI PRACOWNIKA */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ścieżki Pracownika</h5>
                    <button onClick={resetWorkerFlowForm} className="text-xs text-indigo-600 hover:underline font-medium flex items-center gap-1"><Plus size={12}/> Nowa</button>
                </div>

                <form onSubmit={handleWorkerFlowSubmit} className="p-3 bg-white rounded-lg border border-slate-200 space-y-2 mb-3 shadow-sm">
                    <div className="grid grid-cols-2 gap-2">
                        <select value={fromWorkerNode} onChange={(e) => setFromWorkerNode(e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white"><option value="">Pula</option>{workerPools.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
                        <select value={toWorkerNode} onChange={(e) => setToWorkerNode(e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white"><option value="">Stacja</option>{stations.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
                    </div>
                     <div className="flex gap-2">
                         <input type="number" placeholder="Dystans" value={workerDistance} min="0.1" step="0.1" onChange={(e) => setWorkerDistance(e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-sm"/>
                         <button type="submit" className="flex-1 bg-indigo-600 text-white py-1.5 rounded text-xs font-semibold hover:bg-indigo-700">{isEditingWorkerFlow ? "Zapisz" : "Dodaj"}</button>
                        {isEditingWorkerFlow && (<button type="button" onClick={handleWorkerFlowDelete} className="bg-white text-red-600 border border-red-200 py-1.5 px-2 rounded text-xs hover:bg-red-50"><Trash2 size={14}/></button>)}
                    </div>
                </form>

                <div className="space-y-2 mb-3">
                        {workerFlows.map(flow => {
                             const fromName = workerPools.find(wp => wp.id === flow.from)?.name || flow.from;
                             const toName = stations.find(s => s.id === flow.to)?.name || flow.to;
                             return (
                                 <button key={flow.id} onClick={() => setSelectedWorkerFlowId(flow.id)} className={`w-full flex justify-between items-center p-2 rounded-lg border text-sm text-left transition-all ${selectedWorkerFlowId === flow.id ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-slate-200 hover:border-indigo-300'}`}>
                                    <div className="flex items-center gap-2"><Users size={14} className="text-slate-400"/> <span className="font-medium text-slate-700">{fromName} → {toName}</span></div>
                                    <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{flow.distance}m</span>
                                </button>
                            );
                        })}
                </div>
            </div>
            
            <hr className="mb-6 border-slate-200"/>
            
            {/* 3. NARZĘDZIA */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Przypisz Narzędzia</h4>
                <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-3 shadow-sm">
                    <select value={selectedToolPool} onChange={(e) => setSelectedToolPool(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-500 outline-none"><option value="">-- Wybierz pulę --</option>{toolPools.map(pool => <option key={pool.id} value={pool.id}>{pool.name}</option>)}</select>
                    {selectedToolPool && (
                        <div className="border border-slate-200 rounded p-1">
                             <DualListBox options={flows} selectedItems={assignedFlows} onSelectionChange={handleToolAssignmentChange} renderItem={(item) => item.name} height="120px"/>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- GŁÓWNY KOMPONENT WIDOKU (CANVAS AS BACKGROUND) ---

export default function ModuleVisualization() { 
    const [activeTab, setActiveTab] = useState('stations'); 
    const [isPanelOpen, setIsPanelOpen] = useState(true);

    const navItems = [
        { id: 'stations', label: 'Stacje Robocze', icon: Factory, color: 'text-blue-600' },
        { id: 'buffers', label: 'Bufory', icon: Box, color: 'text-orange-600' },
        { id: 'resources', label: 'Zasoby', icon: Users, color: 'text-indigo-600' },
        { id: 'flows', label: 'Połączenia', icon: ArrowRightLeft, color: 'text-emerald-600' },
    ];

    return ( 
        // FIX: Używamy sztywnej wysokości [82vh], aby naprawić problem "Empty Page"
        <div className="relative w-full h-[82vh] overflow-hidden font-sans text-slate-900 bg-slate-50 rounded-xl border border-slate-200 shadow-card"> 
            
            {/* 1. LAYER - CANVAS (TŁO) */}
            <div className="absolute inset-0 z-0">
                <VisualizationCanvas /> 
            </div>

            {/* 2. LAYER - INFO BAR (TOP RIGHT) */}
            <div className="absolute top-4 right-4 z-10 flex gap-4 pointer-events-none">
                 <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-sm border border-slate-200 pointer-events-auto">
                    <span className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                        <Cpu size={14} className="text-blue-500"/> Wizualizacja Przepływu
                    </span>
                 </div>
            </div>

            {/* 3. LAYER - FLOATING MENU (LEFT) */}
            <div className={`
                absolute top-4 bottom-4 left-4 z-20 flex 
                bg-white/95 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-2xl
                transition-all duration-300 ease-in-out overflow-hidden
                ${isPanelOpen ? 'w-[500px]' : 'w-20'}
            `}>
                
                {/* 3a. STRIP NAWIGACYJNY (ZAWSZE WIDOCZNY) */}
                <div className="w-20 flex flex-col items-center py-6 gap-4 shrink-0 border-r border-slate-100 bg-white/50">
                    <button 
                        onClick={() => setIsPanelOpen(!isPanelOpen)}
                        className="mb-4 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                        title={isPanelOpen ? "Zwiń" : "Rozwiń"}
                    >
                        {isPanelOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
                    </button>

                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => { setActiveTab(item.id); setIsPanelOpen(true); }}
                                className={`
                                    w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 group relative
                                    ${isActive 
                                        ? 'bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100' 
                                        : 'bg-transparent text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm'
                                    }
                                `}
                            >
                                <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                                <span className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0 whitespace-nowrap pointer-events-none z-50 shadow-lg">
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* 3b. TREŚĆ PANELU (TYLKO GDY ROZWINIĘTE) */}
                <div className={`flex-1 flex flex-col min-w-0 transition-opacity duration-300 ${isPanelOpen ? 'opacity-100' : 'opacity-0'}`}>
                     {activeTab === 'stations' && <ModuleStation />}
                     {activeTab === 'buffers' && <ModuleBuffer />}
                     {activeTab === 'resources' && <ModuleResources />}
                     {activeTab === 'flows' && <ModuleFlows />}
                </div>

            </div>
        </div> 
    ); 
};