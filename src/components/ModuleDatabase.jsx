import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
    Package, Layers, ChevronDown, ChevronRight, 
    Clock, Users, Wrench, Save, History, RotateCcw, CheckCircle 
} from 'lucide-react';

const ModuleDatabase = () => {
    const { db, setDb } = useApp();
    
    // --- STAN APLIKACJI ---
    const [activeTab, setActiveTab] = useState('casings'); // 'casings' lub 'functions'
    const [expandedSizes, setExpandedSizes] = useState({}); 
    
    // --- SYSTEM WERSJONOWANIA ---
    // Inicjalizujemy wersje bazując na tym, co jest aktualnie w AppContext przy pierwszym wejściu
    const [versions, setVersions] = useState(() => {
        return [{
            id: 'v1_init',
            name: 'V1: Oryginał (Import)',
            timestamp: new Date().toLocaleTimeString(),
            data: JSON.parse(JSON.stringify(db)) // Deep copy
        }];
    });

    const [selectedVersionId, setSelectedVersionId] = useState('v1_init');
    const [localDb, setLocalDb] = useState(JSON.parse(JSON.stringify(db))); // Kopia robocza do edycji
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Synchronizacja przy pierwszym montowaniu lub zmianie DB z zewnątrz (np. nowy import)
    useEffect(() => {
        // Jeśli DB w kontekście jest inne niż nasza wybrana wersja, to znaczy że nastąpił nowy import
        // Resetujemy wtedy historię
        const currentVersionData = versions.find(v => v.id === selectedVersionId)?.data;
        if (JSON.stringify(db) !== JSON.stringify(currentVersionData)) {
             const newInit = {
                id: `v1_${Date.now()}`,
                name: 'V1: Nowy Import',
                timestamp: new Date().toLocaleTimeString(),
                data: JSON.parse(JSON.stringify(db))
            };
            setVersions([newInit]);
            setSelectedVersionId(newInit.id);
            setLocalDb(JSON.parse(JSON.stringify(db)));
            setHasUnsavedChanges(false);
        }
    }, [db]);

    // --- LOGIKA EDYCJI ---
    const currentData = activeTab === 'casings' ? localDb.casings : localDb.functions;
    const label = activeTab === 'casings' ? 'Obudowy (Rodzice)' : 'Funkcje (Komponenty)';

    const toggleSize = (size) => {
        setExpandedSizes(prev => ({ ...prev, [size]: !prev[size] }));
    };

    // Główna funkcja aktualizująca pole w strukturze drzewiastej
    const handleEdit = (size, productCode, opIndex, field, value) => {
        setLocalDb(prev => {
            const category = activeTab === 'casings' ? 'casings' : 'functions';
            const newState = { ...prev };
            
            // Deep clone sekcji, którą zmieniamy, żeby React wykrył zmianę
            newState[category] = { ...prev[category] };
            newState[category][size] = { ...prev[category][size] };
            newState[category][size][productCode] = [...prev[category][size][productCode]];
            
            // Aktualizacja konkretnego pola
            const op = { ...newState[category][size][productCode][opIndex] };
            
            // Parsowanie typów danych
            if (field === 'time') op.time = parseFloat(value) || 0;
            else if (field === 'operators') op.operators = parseInt(value) || 1;
            else if (field === 'montaz') op.montaz = value === true ? 1 : 0;
            else op[field] = value; // np. name

            newState[category][size][productCode][opIndex] = op;
            return newState;
        });
        setHasUnsavedChanges(true);
    };

    // --- LOGIKA ZAPISU I ŁADOWANIA ---
    const handleSaveAndLoad = () => {
        const nextVerNum = versions.length + 1;
        const newVersionId = `v${nextVerNum}_${Date.now()}`;
        
        const newVersion = {
            id: newVersionId,
            name: `V${nextVerNum}: Modyfikacja`,
            timestamp: new Date().toLocaleTimeString(),
            data: JSON.parse(JSON.stringify(localDb)) // Snapshot
        };

        // 1. Dodaj do historii
        setVersions(prev => [...prev, newVersion]);
        
        // 2. Ustaw jako aktywną
        setSelectedVersionId(newVersionId);
        
        // 3. Wyślij do AppContext (Globalny stan aplikacji)
        setDb(localDb);
        
        // 4. Reset flagi zmian
        setHasUnsavedChanges(false);
    };

    // --- LOGIKA PRZYWRACANIA WERSJI ---
    const handleVersionChange = (versionId) => {
        const targetVersion = versions.find(v => v.id === versionId);
        if (targetVersion) {
            // Czy na pewno?
            if (hasUnsavedChanges && !window.confirm("Masz niezapisane zmiany. Czy na pewno chcesz przełączyć wersję i je utracić?")) {
                return;
            }

            setSelectedVersionId(versionId);
            setLocalDb(JSON.parse(JSON.stringify(targetVersion.data))); // Nadpisz roboczą
            setDb(targetVersion.data); // Nadpisz globalną
            setHasUnsavedChanges(false);
        }
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen pb-20">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* 1. PANEL KONTROLNY WERSJI */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                            <History size={24} />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-bold text-gray-500 uppercase">Aktywna Wersja Bazy</label>
                            <select 
                                value={selectedVersionId}
                                onChange={(e) => handleVersionChange(e.target.value)}
                                className="font-mono font-semibold text-gray-800 bg-transparent border-none focus:ring-0 cursor-pointer hover:text-blue-600"
                            >
                                {versions.map(v => (
                                    <option key={v.id} value={v.id}>
                                        {v.name} ({v.timestamp})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                        {hasUnsavedChanges ? (
                            <div className="flex items-center gap-2 animate-pulse text-amber-600 font-medium text-sm mr-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                Niezapisane zmiany...
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-green-600 font-medium text-sm mr-2">
                                <CheckCircle size={16} />
                                Baza zsynchronizowana
                            </div>
                        )}
                        
                        <button
                            onClick={handleSaveAndLoad}
                            disabled={!hasUnsavedChanges}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold shadow-sm transition-all ${
                                hasUnsavedChanges 
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md transform hover:-translate-y-0.5' 
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            <Save size={18} />
                            Zapisz i Załaduj do Symulacji
                        </button>
                    </div>
                </div>

                {/* 2. ZAKŁADKI KATEGORII */}
                <div className="flex justify-center">
                    <div className="bg-gray-200 p-1 rounded-lg inline-flex">
                        <button
                            onClick={() => setActiveTab('casings')}
                            className={`flex items-center px-6 py-2 rounded-md transition-all font-medium ${
                                activeTab === 'casings' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            <Package size={18} className="mr-2" />
                            Obudowy (Rodzice)
                        </button>
                        <button
                            onClick={() => setActiveTab('functions')}
                            className={`flex items-center px-6 py-2 rounded-md transition-all font-medium ${
                                activeTab === 'functions' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            <Layers size={18} className="mr-2" />
                            Funkcje (Komponenty)
                        </button>
                    </div>
                </div>

                {/* 3. LISTA DANYCH (EDYCJA) */}
                <div className="space-y-4">
                    {Object.keys(currentData).length === 0 ? (
                        <div className="text-center p-10 bg-white rounded-xl shadow border border-gray-200 text-gray-400">
                            Brak danych w kategorii {label}. Zaimportuj pliki CSV.
                        </div>
                    ) : (
                        Object.entries(currentData).map(([size, products]) => (
                            <div key={size} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <button 
                                    onClick={() => toggleSize(size)}
                                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100"
                                >
                                    <div className="flex items-center gap-3">
                                        {expandedSizes[size] ? <ChevronDown size={20} className="text-blue-600"/> : <ChevronRight size={20} className="text-gray-400"/>}
                                        <span className="font-bold text-gray-700 text-lg">Wymiar: {size}</span>
                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                            Produkty: {Object.keys(products).length}
                                        </span>
                                    </div>
                                </button>

                                {expandedSizes[size] && (
                                    <div className="p-4 space-y-6 bg-white">
                                        {Object.entries(products).map(([productCode, operations]) => (
                                            <div key={productCode} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                                                    <div className={`w-1.5 h-6 rounded-full ${activeTab === 'casings' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                                                    <h3 className="font-bold text-gray-800">{productCode}</h3>
                                                </div>

                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                                                            <tr>
                                                                <th className="px-3 py-2 w-1/3">Nazwa Operacji</th>
                                                                <th className="px-3 py-2 text-center w-24"><Clock size={14} className="inline mr-1"/>Czas [h]</th>
                                                                <th className="px-3 py-2 text-center w-24"><Users size={14} className="inline mr-1"/>Op.</th>
                                                                <th className="px-3 py-2 text-center w-32"><Wrench size={14} className="inline mr-1"/>Montaż?</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {operations.map((op, idx) => (
                                                                <tr key={idx} className="hover:bg-blue-50/50 transition-colors group">
                                                                    <td className="px-3 py-2">
                                                                        <input 
                                                                            type="text" 
                                                                            value={op.name}
                                                                            onChange={(e) => handleEdit(size, productCode, idx, 'name', e.target.value)}
                                                                            className="w-full bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none hover:border-gray-300 px-1 py-1 transition-colors font-medium text-gray-700"
                                                                        />
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <input 
                                                                            type="number" 
                                                                            step="0.01"
                                                                            min="0"
                                                                            value={op.time}
                                                                            onChange={(e) => handleEdit(size, productCode, idx, 'time', e.target.value)}
                                                                            className="w-full text-center bg-gray-50 border border-gray-200 rounded px-1 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                                                                        />
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <input 
                                                                            type="number" 
                                                                            min="1"
                                                                            value={op.operators}
                                                                            onChange={(e) => handleEdit(size, productCode, idx, 'operators', e.target.value)}
                                                                            className="w-full text-center bg-gray-50 border border-gray-200 rounded px-1 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                                                                        />
                                                                    </td>
                                                                    <td className="px-3 py-2 text-center">
                                                                        <button
                                                                            onClick={() => handleEdit(size, productCode, idx, 'montaz', !(op.montaz === 1))}
                                                                            className={`px-3 py-1 rounded text-xs font-bold transition-all border ${
                                                                                op.montaz === 1 
                                                                                    ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200' 
                                                                                    : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
                                                                            }`}
                                                                        >
                                                                            {op.montaz === 1 ? 'TAK' : 'NIE'}
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ModuleDatabase;