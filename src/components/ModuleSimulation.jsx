import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';

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
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Globalna Kolejność Montażu</h3>
            <div className="grid grid-cols-2 gap-6">
                <div className="border p-3 rounded-lg">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Dostępne</h4>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                        {availableCodes.map(code => (
                            <button key={code} onClick={() => addToSequence(code)} className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-blue-50 rounded text-sm border border-transparent hover:border-blue-200"> + {code} </button>
                        ))}
                    </div>
                </div>
                <div className="border p-3 rounded-lg bg-blue-50">
                    <h4 className="text-xs font-bold text-blue-600 uppercase mb-2">Sekwencja (1 = Start)</h4>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                        {sequence.map((code, idx) => (
                            <div key={code} className="flex items-center justify-between bg-white p-2 rounded shadow-sm border border-blue-100">
                                <span className="font-bold text-sm w-8">{idx + 1}.</span>
                                <span className="flex-1 font-medium">{code}</span>
                                <div className="flex space-x-1">
                                    <button onClick={() => moveItem(idx, -1)} className="text-gray-400 hover:text-blue-600 px-1">▲</button>
                                    <button onClick={() => moveItem(idx, 1)} className="text-gray-400 hover:text-blue-600 px-1">▼</button>
                                    <button onClick={() => removeFromSequence(code)} className="text-red-400 hover:text-red-600 px-2 font-bold">×</button>
                                </div>
                            </div>
                        ))}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Wybierz Rozmiar do Edycji</label> 
                <select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"> <option value="">-- Wybierz rozmiar --</option>{allSizes.map(s => <option key={s} value={s}>{s}</option>)} </select> 
            </div> 
            {selectedSize && ( 
                <div className="p-3 bg-gray-50 rounded-md space-y-3 border"> 
                    <h5 className="font-semibold text-gray-800">Ustawienia dla: {selectedSize}</h5> 
                    <div> <label className="block text-xs font-medium text-gray-700 mb-1">Czas Bazowy (dla Obudowy) (h)</label> <input type="number" value={getRuleValue(selectedSize, 'baseTime')} onChange={(e) => handleRuleChange(selectedSize, 'baseTime', e.target.value)} min="0" step="0.01" className="w-full p-2 border border-gray-300 rounded-lg text-sm"/> </div> 
                    {functionsForSize.length > 0 && ( <div className="space-y-2 pt-2"> <label className="block text-xs font-medium text-gray-700">Czasy Dodatkowe (dla Funkcji)</label> {functionsForSize.map(funcCode => ( <div key={funcCode} className="grid grid-cols-2 items-center gap-2"> <label className="text-sm text-gray-600">Czas dla Funkcji: <span className="font-semibold">{funcCode}</span> (h)</label> <input type="number" value={getRuleValue(selectedSize, 'functionTime', funcCode)} onChange={(e) => handleRuleChange(selectedSize, 'functionTime', e.target.value, funcCode)} min="0" step="0.01" className="w-full p-2 border border-gray-300 rounded-lg text-sm"/> </div> ))} </div> )} 
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
    const allSizesMemo = useMemo(() => { const funcSizes = db.functions ? Object.keys(db.functions) : []; const caseSizes = db.casings ? Object.keys(db.casings) : []; return [...new Set([...funcSizes, ...caseSizes])].sort(); }, [db]);
    const handleDateChange = (e) => { setSimulationSettings(prev => ({ ...prev, startDate: e.target.value })); };
    const handleImportSettings = (e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (ev) => { try { const data = JSON.parse(ev.target.result); importData(data, 'settings'); } catch(err) { alert("Błąd pliku ustawień: " + err.message); } }; reader.readAsText(file); };

    const updateShift = (shiftId, field, value) => {
        setSimulationSettings(prev => ({
            ...prev,
            shifts: { ...(prev.shifts || {}), [shiftId]: { ...(prev.shifts?.[shiftId] || {}), [field]: value } }
        }));
    };

    return (
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-lg space-y-8">
            <div className="flex justify-between items-start">
                 <div>
                    <h3 className="text-lg font-semibold mb-4">Ustawienia Symulacji</h3>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700">Data Rozpoczęcia</label>
                        <input type="text" value={simulationSettings.startDate} onChange={handleDateChange} placeholder="DD-MM-YYYY" className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700">Wymagany Takt (min)</label>
                        <input type="number" min="0" step="0.1" value={simulationSettings.targetTakt || ''} onChange={(e) => setSimulationSettings(prev => ({...prev, targetTakt: parseFloat(e.target.value) || 0}))} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
                    </div>
                 </div>
                 <div className="flex flex-col space-y-2">
                     <button onClick={exportSettingsOnly} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-sm border">💾 Zapisz</button>
                     <label className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-sm border cursor-pointer text-center">📂 Wczytaj <input type="file" accept=".json" className="hidden" onChange={handleImportSettings}/></label>
                 </div>
            </div>
            <button onClick={runSimulation} className="w-full bg-green-500 text-white py-2 px-4 rounded-lg hover:bg-green-600 text-lg font-bold">Uruchom Symulację</button>
            <hr />
            <ModuleAssemblySettings />
            <hr />
            <div>
                <h3 className="text-lg font-semibold mb-4">Harmonogram Pracy</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-2 border">Zmiana</th><th className="p-2 border text-center">Aktywna</th><th className="p-2 border text-center">Dni</th><th className="p-2 border text-center">Godziny</th></tr></thead>
                        <tbody>
                            {[1, 2, 3, 4].map(shiftId => {
                                const shift = shifts[shiftId] || {};
                                return (
                                    <tr key={shiftId} className="border-b hover:bg-gray-50">
                                        <td className="p-2 border font-bold">Zmiana {shiftId}</td>
                                        <td className="p-2 border text-center"><input type="checkbox" checked={shift.active || false} onChange={(e) => updateShift(shiftId, 'active', e.target.checked)} className="h-5 w-5"/></td>
                                        <td className="p-2 border text-center"><input type="number" min="0" max="7" value={shift.days || 0} onChange={(e) => updateShift(shiftId, 'days', parseInt(e.target.value))} className="w-16 p-1 border rounded text-center" disabled={!shift.active}/></td>
                                        <td className="p-2 border text-center"><div className="flex items-center justify-center space-x-2"><input type="time" value={shift.start || "00:00"} onChange={(e) => updateShift(shiftId, 'start', e.target.value)} className="p-1 border rounded" disabled={!shift.active}/><span>-</span><input type="time" value={shift.end || "00:00"} onChange={(e) => updateShift(shiftId, 'end', e.target.value)} className="p-1 border rounded" disabled={!shift.active}/></div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <hr />
            <div><h3 className="text-lg font-semibold mb-4">Czasy Kontroli Jakości</h3><TimeRuleEditor type="quality" settings={qualitySettings} setSimulationSettings={setSimulationSettings} allSizes={allSizesMemo} selectedSize={selectedQualitySize} setSelectedSize={setSelectedQualitySize} db={db}/></div>
             <hr />
             <div><h3 className="text-lg font-semibold mb-4">Czasy Pakowania</h3><TimeRuleEditor type="packing" settings={packingSettings} setSimulationSettings={setSimulationSettings} allSizes={allSizesMemo} selectedSize={selectedPackingSize} setSelectedSize={setSelectedPackingSize} db={db}/></div>
        </div>
    );
};