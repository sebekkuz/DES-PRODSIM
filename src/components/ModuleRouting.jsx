import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DualListBox } from './SharedComponents';
import { 
    FileJson, 
    Save, 
    Upload, 
    Settings2, 
    Search, 
    Clock, 
    ArrowRightLeft,
    CheckCircle2,
    Layers,
    Wrench,
    AlertCircle
} from 'lucide-react';

export default function ModuleRouting() { 
    const { db, simulationConfig, updateRouting, exportRoutingsOnly, importData } = useApp(); 
    const { functions, casings } = db; 
    const { routings } = simulationConfig; 
    const [sourceType, setSourceType] = useState('functions'); 
    const [selectedSize, setSelectedSize] = useState(''); 
    const [selectedKey, setSelectedKey] = useState(''); 
    const [selectedPhase, setSelectedPhase] = useState(0); 
    const [availableOps, setAvailableOps] = useState([]); 
    const [routingOps, setRoutingOps] = useState([]); 
    
    // --- LOGIKA BIZNESOWA (BEZ ZMIAN) ---
    const sizes = useMemo(() => { 
        const funcSizes = Object.keys(functions); const caseSizes = Object.keys(casings); 
        return [...new Set([...funcSizes, ...caseSizes])].sort(); 
    }, [functions, casings]); 
    
    const keys = useMemo(() => { 
        if (!selectedSize) return []; 
        const source = (sourceType === 'functions') ? functions : casings; 
        return Object.keys(source[selectedSize] || {}).sort(); 
    }, [selectedSize, sourceType, functions, casings]); 
    
    useEffect(() => { 
        if (!selectedSize || !selectedKey) { 
            setAvailableOps([]); setRoutingOps([]); return; 
        } 
        const source = (sourceType === 'functions') ? functions : casings; 
        const allOpsFromDb = source[selectedSize]?.[selectedKey] || []; 
        
        const routingKey = `${sourceType}_${selectedSize}_${selectedKey}_phase${selectedPhase}`; 
        const savedRouting = routings[routingKey] || []; 
        
        setRoutingOps(savedRouting); 
        
        const savedOpIds = new Set(savedRouting.map(op => op.id)); 
        const available = allOpsFromDb.filter(op => !savedOpIds.has(op.id) && op.montaz === selectedPhase); 
        
        setAvailableOps(available); 
    }, [selectedSize, selectedKey, sourceType, functions, casings, routings, selectedPhase]); 
    
    const handleRoutingChange = (newOperationsList) => { 
        const routingKey = `${sourceType}_${selectedSize}_${selectedKey}_phase${selectedPhase}`; 
        setRoutingOps(newOperationsList); 
        updateRouting(routingKey, newOperationsList); 
    }; 

    const handleTimeEdit = (index, newTime) => {
        const updatedOps = [...routingOps];
        updatedOps[index].time = parseFloat(newTime);
        handleRoutingChange(updatedOps);
    };

    const handleImportRoutings = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                importData(data, 'routings');
            } catch(err) { alert("Błąd pliku marszrut: " + err.message); }
        };
        reader.readAsText(file);
    };
    
    const isSelectionComplete = selectedSize && selectedKey;

    return ( 
        // GŁÓWNY KONTENER - STYLIZACJA JAK KONFIGURATOR LINII
        <div className="flex h-[82vh] gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-card font-sans text-slate-900 overflow-hidden">
            
            {/* LEWY PANEL - KONFIGURACJA I WYBÓR */}
            <aside className="w-80 flex flex-col gap-5 bg-white rounded-xl shadow-sm border border-slate-200 p-5 shrink-0 overflow-y-auto custom-scrollbar">
                
                {/* Header Panelu */}
                <div className="pb-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Settings2 size={16} className="text-blue-600"/> Konfiguracja
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Wybierz produkt i fazę procesu</p>
                </div>

                {/* Sekcja Wyboru Produktu */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rodzaj Elementu</label>
                        <div className="grid grid-cols-2 gap-2">
                             <button 
                                onClick={() => { setSelectedSize(''); setSelectedKey(''); setSourceType('functions'); }}
                                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${sourceType === 'functions' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                             >
                                Funkcje (Dzieci)
                             </button>
                             <button 
                                onClick={() => { setSelectedSize(''); setSelectedKey(''); setSourceType('casings'); }}
                                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${sourceType === 'casings' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                             >
                                Obudowy (Rodzic)
                             </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rozmiar</label>
                        <div className="relative">
                            <select value={selectedSize} onChange={e => { setSelectedSize(e.target.value); setSelectedKey(''); }} className="w-full p-2.5 pl-3 pr-8 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none">
                                <option value="">-- Wybierz --</option>{sizes.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <Search className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={16}/>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Klucz Wariantu</label>
                        <select value={selectedKey} onChange={e => setSelectedKey(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-400" disabled={!selectedSize}>
                            <option value="">-- Wybierz --</option>{keys.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </div>
                </div>

                <div className="border-t border-slate-100 my-1"></div>

                {/* Sekcja Fazy */}
                <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Faza Produkcji</label>
                     <div className="flex flex-col gap-2">
                        <button 
                            onClick={() => setSelectedPhase(0)}
                            className={`flex items-center p-3 rounded-xl border text-left transition-all ${selectedPhase === 0 ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                        >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${selectedPhase === 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                <Layers size={18}/>
                            </div>
                            <div>
                                <span className={`block text-xs font-bold ${selectedPhase === 0 ? 'text-indigo-900' : 'text-slate-700'}`}>Faza 0: Podmontaż</span>
                                <span className="text-[10px] text-slate-500">Przygotowanie komponentów</span>
                            </div>
                            {selectedPhase === 0 && <CheckCircle2 size={16} className="ml-auto text-indigo-500"/>}
                        </button>

                        <button 
                            onClick={() => setSelectedPhase(1)}
                            className={`flex items-center p-3 rounded-xl border text-left transition-all ${selectedPhase === 1 ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                        >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${selectedPhase === 1 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                <Wrench size={18}/>
                            </div>
                            <div>
                                <span className={`block text-xs font-bold ${selectedPhase === 1 ? 'text-emerald-900' : 'text-slate-700'}`}>Faza 1: Montaż Główny</span>
                                <span className="text-[10px] text-slate-500">Składanie finalne</span>
                            </div>
                            {selectedPhase === 1 && <CheckCircle2 size={16} className="ml-auto text-emerald-500"/>}
                        </button>
                     </div>
                </div>

                <div className="mt-auto pt-4 space-y-2">
                     <button onClick={exportRoutingsOnly} className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg text-xs font-semibold border border-slate-200 transition-all">
                        <Save size={14} /> Zapisz (.json)
                    </button>
                    <label className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg text-xs font-semibold border border-slate-200 cursor-pointer transition-all">
                        <Upload size={14} /> Wczytaj
                        <input type="file" accept=".json" className="hidden" onChange={handleImportRoutings}/>
                    </label>
                </div>

            </aside>

            {/* PRAWY PANEL - EDYTOR (DUAL LIST + CZASY) */}
            <main className="flex-1 flex flex-col gap-4 min-w-0">
                
                {/* Górny pasek informacyjny */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <ArrowRightLeft className="text-slate-400" size={20}/> Edytor Kolejności
                        </h3>
                         {isSelectionComplete ? (
                            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                {selectedSize} / {selectedKey}
                            </span>
                        ) : (
                            <span className="text-xs text-slate-400 italic">Wybierz produkt z menu po lewej</span>
                        )}
                    </div>
                    {isSelectionComplete && (
                        <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Liczba operacji</div>
                            <div className="text-lg font-bold text-slate-700 leading-none">{routingOps.length}</div>
                        </div>
                    )}
                </div>

                {/* Obszar roboczy */}
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
                    {isSelectionComplete ? (
                        <div className="flex flex-col h-full">
                            
                            {/* Dual List Box Wrapper */}
                            <div className="flex-1 p-5 overflow-hidden flex flex-col">
                                <DualListBox 
                                    options={availableOps} 
                                    selectedItems={routingOps} 
                                    onSelectionChange={handleRoutingChange} 
                                    height="100%" 
                                    renderItem={(op) => (
                                        <div className="flex items-center justify-between w-full">
                                            <span>{op.name}</span>
                                            <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 rounded ml-2">{op.time}h</span>
                                        </div>
                                    )}
                                /> 
                            </div>

                            {/* Panel Edycji Czasów (Dolny pasek) */}
                            <div className="h-48 border-t border-slate-100 bg-slate-50/50 flex flex-col">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                                    <Clock size={14} className="text-orange-500"/>
                                    <h4 className="text-xs font-bold text-slate-600 uppercase">Korekta Czasów Operacji</h4>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                    {routingOps.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {routingOps.map((op, idx) => (
                                                <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between group hover:border-blue-300 transition-colors">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="w-5 h-5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center shrink-0 group-hover:bg-blue-50 group-hover:text-blue-600">{idx + 1}</span>
                                                        <span className="text-xs font-medium text-slate-700 truncate" title={op.name}>{op.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 bg-slate-50 rounded border border-slate-200 px-1.5 py-0.5">
                                                        <input 
                                                            type="number" 
                                                            step="0.01" 
                                                            min="0"
                                                            value={op.time} 
                                                            onChange={(e) => handleTimeEdit(idx, e.target.value)}
                                                            className="w-12 bg-transparent text-xs font-bold text-right text-slate-800 outline-none focus:text-blue-600"
                                                        />
                                                        <span className="text-[10px] text-slate-400">h</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                            <p className="text-xs">Dodaj operacje do listy wybranej, aby edytować ich czasy.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4">
                            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                                <ArrowRightLeft size={32} />
                            </div>
                            <p className="text-sm font-medium text-slate-400">Rozpocznij konfigurację w panelu po lewej stronie</p>
                        </div>
                    )}
                </div>
            </main>
        </div> 
    ); 
};