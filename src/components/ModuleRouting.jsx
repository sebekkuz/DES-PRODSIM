import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DualListBox } from './SharedComponents';

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
    
    return ( 
        <div className="max-w-5xl mx-auto space-y-4">
            <div className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
                <h3 className="text-lg font-semibold">Edytor Marszrut</h3>
                <div className="flex space-x-2">
                    <button onClick={exportRoutingsOnly} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-sm border">
                        💾 Zapisz Marszruty (.json)
                    </button>
                    <label className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-sm border cursor-pointer">
                        📂 Wczytaj Marszruty
                        <input type="file" accept=".json" className="hidden" onChange={handleImportRoutings}/>
                    </label>
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <p className="text-sm text-gray-600 mb-4">Wybierz produkt i fazę, aby zdefiniować kolejność operacji.</p>
                
                <div className="flex space-x-4 mb-4 p-3 bg-gray-100 rounded-lg">
                    <label className="flex items-center cursor-pointer">
                        <input type="radio" name="phase" checked={selectedPhase === 0} onChange={() => setSelectedPhase(0)} className="form-radio text-blue-600" />
                        <span className="ml-2 font-semibold">Faza 1: Podmontaż (0)</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                        <input type="radio" name="phase" checked={selectedPhase === 1} onChange={() => setSelectedPhase(1)} className="form-radio text-green-600" />
                        <span className="ml-2 font-semibold">Faza 2: Montaż Główny (1)</span>
                    </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <select value={sourceType} onChange={e => { setSelectedSize(''); setSelectedKey(''); setSourceType(e.target.value); }} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">
                        <option value="functions">Funkcje (Dzieci)</option><option value="casings">Obudowy (Rodzice)</option>
                    </select>
                    <select value={selectedSize} onChange={e => { setSelectedSize(e.target.value); setSelectedKey(''); }} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white">
                        <option value="">1. Wybierz Rozmiar</option>{sizes.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={selectedKey} onChange={e => setSelectedKey(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" disabled={!selectedSize}>
                        <option value="">2. Wybierz Klucz</option>{keys.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                </div>
                
                {selectedSize && selectedKey && ( 
                    <>
                        <DualListBox 
                            title={`Marszruta dla: ${selectedSize} ${selectedKey} (Faza ${selectedPhase})`}
                            options={availableOps} 
                            selectedItems={routingOps} 
                            onSelectionChange={handleRoutingChange} 
                            height="300px" 
                            renderItem={(op) => `${op.name} (${op.time}h)`}
                        /> 
                        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <h4 className="font-bold text-sm mb-2 text-yellow-800">Edycja Czasów Operacji</h4>
                            <p className="text-xs text-gray-600 mb-3">Tutaj możesz nadpisać standardowe czasy z bazy danych dla tej konkretnej marszruty.</p>
                            <div className="max-h-60 overflow-y-auto">
                                {routingOps.map((op, idx) => (
                                    <div key={idx} className="flex items-center justify-between mb-2 p-2 bg-white rounded shadow-sm">
                                        <span className="text-sm font-medium w-1/2">{idx + 1}. {op.name}</span>
                                        <div className="flex items-center">
                                            <label className="text-xs mr-2 text-gray-500">Czas (h):</label>
                                            <input 
                                                type="number" 
                                                step="0.01" 
                                                value={op.time} 
                                                onChange={(e) => handleTimeEdit(idx, e.target.value)}
                                                className="w-20 p-1 border rounded text-sm text-right"
                                            />
                                        </div>
                                    </div>
                                ))}
                                {routingOps.length === 0 && <p className="text-xs text-gray-400 italic">Wybierz operacje powyżej, aby edytować czasy.</p>}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div> 
    ); 
};