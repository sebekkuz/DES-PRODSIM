import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
    Play, 
    Save, 
    Upload, 
    Settings2, 
    Calendar, 
    Clock, 
    ListOrdered, 
    CheckCircle2, 
    AlertCircle, 
    ArrowRight, 
    X, 
    ChevronUp, 
    ChevronDown,
    Timer,
    Briefcase
} from 'lucide-react';

// --- SUB-KOMPONENTY ---

const ModuleAssemblySettings = () => {
    const { simulationSettings, setSimulationSettings, db } = useApp();
    const allCodes = useMemo(() => {
        const codes = new Set();
        if (db.functions) Object.values(db.functions).forEach(sizeGroup => Object.keys(sizeGroup).forEach(key => codes.add(key)));
        if (db.casings) Object.values(db.casings).forEach(sizeGroup => Object.keys(sizeGroup).forEach(key => codes.add(key)));
        return Array.from(codes).sort();
    }, [db]);

    const [availableCodes, setAvailableCodes] = useState([]);
    const [sequence, setSequence] = useState([]);

    useEffect(() => {
        const currentSequence = simulationSettings.assemblySequence || [];
        setSequence(currentSequence);
        setAvailableCodes(allCodes.filter(c => !currentSequence.includes(c)));
    }, [simulationSettings.assemblySequence, allCodes]);

    const addToSequence = (code) => { const newSeq = [...sequence, code]; setSimulationSettings(prev => ({ ...prev, assemblySequence: newSeq })); };
    const removeFromSequence = (code) => { const newSeq = sequence.filter(c => c !== code); setSimulationSettings(prev => ({ ...prev, assemblySequence: newSeq })); };
    const moveItem = (index, direction) => { const newSeq = [...sequence]; if (index + direction < 0 || index + direction >= newSeq.length) return; [newSeq[index], newSeq[index + direction]] = [newSeq[index + direction], newSeq[index]]; setSimulationSettings(prev => ({ ...prev, assemblySequence: newSeq })); };

    return (
        <div className="flex flex-col h-full">
            <div className="grid grid-cols-2 gap-6 h-full min-h-0">
                {/* DOSTĘPNE */}
                <div className="flex flex-col bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dostępne Elementy</h4>
                        <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full">{availableCodes.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {availableCodes.map(code => (
                            <button 
                                key={code} 
                                onClick={() => addToSequence(code)} 
                                className="w-full text-left px-3 py-2.5 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg border border-slate-200 hover:border-blue-200 text-sm font-medium transition-all flex items-center justify-between group"
                            >
                                <span>{code}</span>
                                <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                            </button>
                        ))}
                        {availableCodes.length === 0 && <div className="text-center py-10 text-xs text-slate-400">Wszystkie elementy użyte</div>}
                    </div>
                </div>

                {/* SEKWENCJA */}
                <div className="flex flex-col bg-blue-50/50 rounded-xl border border-blue-100 overflow-hidden">
                    <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Sekwencja Montażu</h4>
                        <span className="bg-blue-100 text-blue-600 text-[10px] px-2 py-0.5 rounded-full">{sequence.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                        {sequence.map((code, idx) => (
                            <div key={code} className="flex items-center gap-3 bg-white p-2 rounded-lg shadow-sm border border-blue-100 group">
                                <span className="flex items-center justify-center w-6 h-6 rounded bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100">
                                    {idx + 1}
                                </span>
                                <span className="flex-1 font-semibold text-slate-700 text-sm">{code}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronUp size={14}/></button>
                                    <button onClick={() => moveItem(idx, 1)} disabled={idx === sequence.length - 1} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronDown size={14}/></button>
                                    <button onClick={() => removeFromSequence(code)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded ml-1"><X size={14}/></button>
                                </div>
                            </div>
                        ))}
                        {sequence.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                <ListOrdered size={24} className="opacity-20"/>
                                <span className="text-xs">Lista pusta. Dodaj elementy.</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const TimeRuleEditor = ({ type, settings, setSimulationSettings, allSizes, selectedSize, setSelectedSize, db }) => { 
    const { functions } = db; 
    const functionsForSize = useMemo(() => { if (!selectedSize || !functions) return []; return Object.keys(functions[selectedSize] || {}).sort(); }, [selectedSize, functions]); 
    const handleRuleChange = (size, key, value, functionCode = null) => { 
        const settingsKey = type === 'quality' ? 'qualitySettings' : 'packingSettings'; 
        setSimulationSettings(prev => { 
            const newSettings = { ...prev[settingsKey] }; 
            if (!newSettings[size]) { newSettings[size] = { baseTime: 0, functionTimes: {} }; } 
            if (key === 'baseTime') { newSettings[size] = { ...newSettings[size], baseTime: parseFloat(value) || 0 }; } 
            else if (key === 'functionTime' && functionCode) { newSettings[size] = { ...newSettings[size], functionTimes: { ...newSettings[size].functionTimes, [functionCode]: parseFloat(value) || 0 } }; } 
            return { ...prev, [settingsKey]: newSettings }; 
        }); 
    }; 
    const getRuleValue = (size, key, functionCode = null) => { 
        const rule = settings[size]; if (!rule) return 0; 
        if (key === 'baseTime') return rule.baseTime || 0; 
        if (key === 'functionTime' && functionCode) { return rule.functionTimes?.[functionCode] || 0; } 
        return 0; 
    }; 
    return ( 
        <div className="space-y-4"> 
            <div> 
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Wybierz Rozmiar do Edycji</label> 
                <select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"> 
                    <option value="">-- Wybierz rozmiar --</option>{allSizes.map(s => <option key={s} value={s}>{s}</option>)} 
                </select> 
            </div> 
            {selectedSize && ( 
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-200"> 
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        <h5 className="font-bold text-slate-700 text-sm">Reguły dla: {selectedSize}</h5> 
                    </div>
                    
                    <div> 
                        <label className="block text-xs font-medium text-slate-600 mb-1">Czas Bazowy (Obudowa)</label> 
                        <div className="flex items-center relative">
                            <input type="number" value={getRuleValue(selectedSize, 'baseTime')} onChange={(e) => handleRuleChange(selectedSize, 'baseTime', e.target.value)} min="0" step="0.01" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none pr-8"/> 
                            <span className="absolute right-3 text-xs text-slate-400 font-medium">h</span>
                        </div>
                    </div> 
                    
                    {functionsForSize.length > 0 && ( 
                        <div className="space-y-2 pt-2"> 
                            <label className="block text-xs font-bold text-slate-500 uppercase">Czasy Dodatkowe (Funkcje)</label> 
                            <div className="grid grid-cols-2 gap-3">
                                {functionsForSize.map(funcCode => ( 
                                    <div key={funcCode} className="bg-white p-2 rounded border border-slate-200"> 
                                        <label className="block text-[10px] text-slate-500 mb-1 font-medium">{funcCode}</label> 
                                        <div className="flex items-center gap-1">
                                            <input type="number" value={getRuleValue(selectedSize, 'functionTime', funcCode)} onChange={(e) => handleRuleChange(selectedSize, 'functionTime', e.target.value, funcCode)} min="0" step="0.01" className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none text-right placeholder-slate-300" placeholder="0"/> 
                                            <span className="text-[10px] text-slate-400">h</span>
                                        </div>
                                    </div> 
                                ))} 
                            </div> 
                        </div> 
                    )} 
                </div> 
            )} 
        </div> 
    ); 
};

// --- GŁÓWNY WIDOK ---

export default function ModuleSimulation() {
    const { simulationSettings, setSimulationSettings, runSimulation, db, exportSettingsOnly, importData } = useApp();
    const { qualitySettings, packingSettings, shifts = {} } = simulationSettings;
    const [selectedQualitySize, setSelectedQualitySize] = useState("");
    const [selectedPackingSize, setSelectedPackingSize] = useState("");
    const [activeSection, setActiveSection] = useState("general"); // 'general', 'assembly', 'times'

    const allSizesMemo = useMemo(() => { const funcSizes = db.functions ? Object.keys(db.functions) : []; const caseSizes = db.casings ? Object.keys(db.casings) : []; return [...new Set([...funcSizes, ...caseSizes])].sort(); }, [db]);
    const handleDateChange = (e) => { setSimulationSettings(prev => ({ ...prev, startDate: e.target.value })); };
    const handleImportSettings = (e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (ev) => { try { const data = JSON.parse(ev.target.result); importData(data, 'settings'); } catch(err) { alert("Błąd pliku ustawień: " + err.message); } }; reader.readAsText(file); };

    const updateShift = (shiftId, field, value) => {
        setSimulationSettings(prev => ({
            ...prev,
            shifts: { ...(prev.shifts || {}), [shiftId]: { ...(prev.shifts?.[shiftId] || {}), [field]: value } }
        }));
    };

    const sections = [
        { id: 'general', label: 'Ogólne i Zmiany', icon: Settings2, desc: 'Data, takt, harmonogram' },
        { id: 'assembly', label: 'Kolejność Montażu', icon: ListOrdered, desc: 'Globalna sekwencja' },
        { id: 'times', label: 'Czasy Procesowe', icon: Timer, desc: 'Jakość i pakowanie' },
    ];

    return (
        // GŁÓWNY KONTENER
        <div className="flex h-[82vh] gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-card font-sans text-slate-900 overflow-hidden">
            
            {/* PANEL BOCZNY */}
            <aside className="w-72 flex flex-col gap-4 bg-white rounded-xl shadow-sm border border-slate-200 p-4 shrink-0 overflow-y-auto custom-scrollbar">
                
                <div className="pb-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Briefcase size={16} className="text-blue-600"/> Konfiguracja
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Parametry symulacji</p>
                </div>

                <div className="space-y-2 flex-1">
                    {sections.map(sec => (
                        <button
                            key={sec.id}
                            onClick={() => setActiveSection(sec.id)}
                            className={`w-full flex items-center p-3 rounded-xl border text-left transition-all group ${activeSection === sec.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-100 hover:border-blue-100 hover:bg-slate-50'}`}
                        >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 shrink-0 ${activeSection === sec.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-50 text-slate-400 group-hover:text-slate-600'}`}>
                                <sec.icon size={20}/>
                            </div>
                            <div>
                                <span className={`block text-xs font-bold ${activeSection === sec.id ? 'text-blue-900' : 'text-slate-700'}`}>{sec.label}</span>
                                <span className="text-[10px] text-slate-500">{sec.desc}</span>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="mt-auto pt-4 space-y-3 border-t border-slate-100">
                    <button onClick={runSimulation} className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-3 px-4 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">
                        <Play size={18} fill="currentColor"/> Uruchom Symulację
                    </button>
                    
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={exportSettingsOnly} className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded-lg text-xs font-medium transition-colors">
                            <Save size={14} /> Zapisz
                        </button>
                        <label className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors">
                            <Upload size={14} /> Wczytaj
                            <input type="file" accept=".json" className="hidden" onChange={handleImportSettings}/>
                        </label>
                    </div>
                </div>

            </aside>

            {/* OBSZAR ROBOCZY */}
            <main className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                
                {/* HEADER OBSZARU */}
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            {sections.find(s => s.id === activeSection)?.icon && React.createElement(sections.find(s => s.id === activeSection).icon, { size: 20, className: 'text-slate-400' })}
                            {sections.find(s => s.id === activeSection)?.label}
                        </h3>
                    </div>
                </div>

                {/* TREŚĆ OBSZARU */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white relative">
                    
                    {/* --- SEKCJA: OGÓLNE I ZMIANY --- */}
                    {activeSection === 'general' && (
                        <div className="space-y-8 max-w-4xl">
                            {/* Ustawienia Podstawowe */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-2"><Calendar size={14}/> Data Rozpoczęcia</label>
                                    <input type="text" value={simulationSettings.startDate} onChange={handleDateChange} placeholder="DD-MM-YYYY" className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-2"><Clock size={14}/> Wymagany Takt (min)</label>
                                    <input type="number" min="0" step="0.1" value={simulationSettings.targetTakt || ''} onChange={(e) => setSimulationSettings(prev => ({...prev, targetTakt: parseFloat(e.target.value) || 0}))} className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"/>
                                </div>
                            </div>

                            {/* Tabela Zmian */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <Briefcase size={16} className="text-slate-400"/> Harmonogram Zmian
                                </h4>
                                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                                            <tr>
                                                <th className="p-3 border-b border-slate-200">Zmiana</th>
                                                <th className="p-3 border-b border-slate-200 text-center">Aktywna</th>
                                                <th className="p-3 border-b border-slate-200 text-center">Liczba Dni</th>
                                                <th className="p-3 border-b border-slate-200 text-center">Godziny Pracy</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {[1, 2, 3, 4].map(shiftId => {
                                                const shift = shifts[shiftId] || {};
                                                return (
                                                    <tr key={shiftId} className={`hover:bg-blue-50/30 transition-colors ${shift.active ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                        <td className="p-3 font-semibold text-slate-700 flex items-center gap-2">
                                                            <div className={`w-2 h-2 rounded-full ${shift.active ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                                            Zmiana {shiftId}
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <input type="checkbox" checked={shift.active || false} onChange={(e) => updateShift(shiftId, 'active', e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"/>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <input type="number" min="0" max="7" value={shift.days || 0} onChange={(e) => updateShift(shiftId, 'days', parseInt(e.target.value))} className="w-16 p-1.5 border border-slate-300 rounded text-center text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400" disabled={!shift.active}/>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <input type="time" value={shift.start || "00:00"} onChange={(e) => updateShift(shiftId, 'start', e.target.value)} className="p-1.5 border border-slate-300 rounded text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400" disabled={!shift.active}/>
                                                                <span className="text-slate-400">-</span>
                                                                <input type="time" value={shift.end || "00:00"} onChange={(e) => updateShift(shiftId, 'end', e.target.value)} className="p-1.5 border border-slate-300 rounded text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400" disabled={!shift.active}/>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- SEKCJA: KOLEJNOŚĆ MONTAŻU --- */}
                    {activeSection === 'assembly' && (
                        <div className="h-full">
                            <ModuleAssemblySettings />
                        </div>
                    )}

                    {/* --- SEKCJA: CZASY PROCESOWE --- */}
                    {activeSection === 'times' && (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                                    <CheckCircle2 className="text-indigo-500" size={20}/>
                                    <h4 className="text-base font-bold text-slate-700">Kontrola Jakości</h4>
                                </div>
                                <TimeRuleEditor type="quality" settings={qualitySettings} setSimulationSettings={setSimulationSettings} allSizes={allSizesMemo} selectedSize={selectedQualitySize} setSelectedSize={setSelectedQualitySize} db={db}/>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                                    <CheckCircle2 className="text-emerald-500" size={20}/>
                                    <h4 className="text-base font-bold text-slate-700">Pakowanie</h4>
                                </div>
                                <TimeRuleEditor type="packing" settings={packingSettings} setSimulationSettings={setSimulationSettings} allSizes={allSizesMemo} selectedSize={selectedPackingSize} setSelectedSize={setSelectedPackingSize} db={db}/>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};