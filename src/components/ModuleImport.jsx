import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { useApp } from '../context/AppContext';
import { FileInput } from './SharedComponents';
import { Database, Save, FileSpreadsheet, Settings, HardDrive, LayoutDashboard, FolderOpen } from 'lucide-react';

// --- LOGIKA BIZNESOWA (BEZ ZMIAN) ---
const processDbData = (data, type) => { 
    if (!data || data.length === 0) return {}; 
    const keyName = type === 'functions' ? 'FUNKCJA' : 'OBUDOWA'; 
    const sizeName = 'Wymiar'; 
    const operationName = 'Operacja'; 
    return data.reduce((acc, row) => { 
        const size = row[sizeName]; 
        const key = row[keyName]; 
        const operation = row[operationName]; 
        const timeH = parseFloat(String(row['Czas [h]']).replace(',', '.') || 0); 
        const operators = parseInt(row['Ilosc operatorow'] || 1); 
        const montazFlag = parseInt(row['MONTAZ'] || 0);

        if (!size || !key || !operation) return acc; 
        if (!acc[size]) acc[size] = {}; 
        if (!acc[size][key]) acc[size][key] = []; 
        
        if (!acc[size][key].find(op => op.name === operation)) { 
            acc[size][key].push({ 
                id: `${size}-${key}-${operation}`, 
                name: operation, 
                time: timeH, 
                operators: operators,
                montaz: montazFlag 
            }); 
        } 
        return acc; 
    }, {}); 
};

export default function ModuleImport() { 
    const { 
        setSimulationConfig, 
        setDb, setMrp, 
        exportFullScenario, exportConfigOnly, exportDbOnly, exportMrpOnly,
        importData, db, mrp
    } = useApp();
    
    const [stats, setStats] = useState({ functions: { count: 0, sizes: 0 }, casings: { count: 0, sizes: 0 }, mrp: { count: 0 } });

    useEffect(() => {
        const countItems = (obj) => {
            let cnt = 0, sz = 0;
            if (obj) {
                sz = Object.keys(obj).length;
                Object.values(obj).forEach(sizeGrp => {
                    Object.values(sizeGrp).forEach(arr => cnt += arr.length);
                });
            }
            return { count: cnt, sizes: sz };
        };
        setStats({
            functions: countItems(db.functions),
            casings: countItems(db.casings),
            mrp: { count: mrp.length }
        });
    }, [db, mrp]);

    const handleFileParse = (file, type) => {
        if (!file) return;
        if (type.includes('json')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (type === 'json_full') importData(data, 'full');
                    else if (type === 'json_config') importData(data, 'config');
                } catch (error) {
                    alert(`Błąd JSON: ${error.message}`);
                }
            };
            reader.readAsText(file);
            return;
        }
        Papa.parse(file, { 
            header: true, 
            skipEmptyLines: true, 
            transformHeader: header => header.trim(), 
            complete: (results) => { 
                const data = results.data; 
                if (type === 'mrp') { 
                    setMrp(data); 
                } else { 
                    const processed = processDbData(data, type); 
                    setDb(prev => ({ ...prev, [type]: processed })); 
                } 
            }, 
            error: (error) => alert(`Błąd CSV: ${error.message}`) 
        }); 
    }; 

    // Helper Component dla wiersza statystyk
    const StatRow = ({ title, icon: Icon, stats, onSave }) => (
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-md border border-slate-200 text-slate-500">
                    <Icon size={20} />
                </div>
                <div>
                    <h4 className="font-semibold text-slate-700 text-sm">{title}</h4>
                    <div className="text-xs text-slate-500 mt-0.5 flex gap-3">
                        {stats.sizes !== undefined && <span>Rozmiary: <strong className="text-slate-700">{stats.sizes}</strong></span>}
                        <span>Rekordy: <strong className="text-slate-700">{stats.count}</strong></span>
                    </div>
                </div>
            </div>
            <button 
                onClick={onSave}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
            >
                <Save size={14} />
                Zapisz
            </button>
        </div>
    );

    return ( 
        <div className="max-w-6xl mx-auto space-y-8 pb-10">
            
            {/* 1. SEKCJA GÓRNA: PEŁNY SCENARIUSZ (NIEBIESKA) */}
            <div className="bg-blue-50/80 rounded-xl border border-blue-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                    <HardDrive className="text-blue-600" size={24} />
                    <h3 className="text-lg font-bold text-blue-900">Zarządzanie Pełnym Scenariuszem</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Okno 1: Zapisz */}
                    <button 
                        onClick={exportFullScenario}
                        className="flex flex-col items-center justify-center p-8 bg-white border-2 border-blue-100 border-dashed rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition-all group text-center gap-3"
                    >
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Save size={24} />
                        </div>
                        <div>
                            <span className="block font-semibold text-blue-900">Zapisz Pełny Scenariusz (.json)</span>
                            <span className="text-xs text-blue-500">Baza danych + MRP + Konfiguracja</span>
                        </div>
                    </button>

                    {/* Okno 2: Wczytaj (POPRAWIONE) - Teraz wygląda jak bliźniak okna Zapisz */}
                    <div className="flex flex-col items-center justify-center p-8 bg-white border-2 border-blue-200 border-dashed rounded-xl text-center gap-3 relative">
                        {/* Ikona FolderOpen dla Wczytywania */}
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-1">
                            <FolderOpen size={24} />
                        </div>
                        
                        {/* Wrapper na FileInput, aby wymusić centrowanie */}
                        <div className="w-full flex justify-center">
                             <FileInput 
                                label="Wczytaj Pełny Scenariusz (.json)" 
                                type="json_full" 
                                onFileSelected={handleFileParse} 
                                accept=".json"
                            />
                        </div>
                        
                        <p className="text-xs text-center text-blue-400 mt-1 max-w-[200px]">
                            UWAGA: Nadpisuje wszystkie obecne dane w aplikacji.
                        </p>
                    </div>
                </div>
            </div>

            {/* 2. SEKCJA ŚRODKOWA: IMPORT (LEWA) vs DANE (PRAWA) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* LEWA: Panel Importowania */}
                <div className="bg-surface shadow-card rounded-xl p-6 border border-border">
                    <div className="flex items-center gap-2 mb-6 pb-2 border-b border-border">
                        <FileSpreadsheet className="text-slate-400" size={20} />
                        <h3 className="font-semibold text-slate-800">1. Import Danych (CSV)</h3>
                    </div>
                    <div className="space-y-5">
                        <FileInput label="Baza: Funkcje / Komponenty" type="functions" onFileSelected={handleFileParse} />
                        <FileInput label="Baza: Obudowy" type="casings" onFileSelected={handleFileParse} />
                        <FileInput label="Plan Produkcyjny (MRP)" type="mrp" onFileSelected={handleFileParse} />
                    </div>
                </div>

                {/* PRAWA: Dane w Aplikacji (Stats & Export) */}
                <div className="bg-surface shadow-card rounded-xl p-6 border border-border">
                    <div className="flex items-center gap-2 mb-6 pb-2 border-b border-border">
                        <Database className="text-slate-400" size={20} />
                        <h3 className="font-semibold text-slate-800">Aktualne Dane Bazy</h3>
                    </div>
                    
                    <div className="space-y-4">
                        <StatRow 
                            title="Funkcje i Komponenty" 
                            icon={Settings} 
                            stats={stats.functions} 
                            onSave={exportDbOnly} 
                        />
                        <StatRow 
                            title="Obudowy" 
                            icon={LayoutDashboard} 
                            stats={stats.casings} 
                            onSave={exportDbOnly} 
                        />
                         <StatRow 
                            title="Plan MRP" 
                            icon={FileSpreadsheet} 
                            stats={stats.mrp} 
                            onSave={exportMrpOnly} 
                        />
                    </div>
                </div>
            </div>

            {/* 3. SEKCJA DOLNA: KONFIGURACJA LINII */}
            <div className="bg-surface shadow-card rounded-xl p-6 border border-border">
                <div className="flex items-center gap-2 mb-6 pb-2 border-b border-border">
                    <Settings className="text-slate-400" size={20} />
                    <h3 className="font-semibold text-slate-800">2. Konfiguracja Linii Produkcyjnej</h3>
                </div>
                
                <p className="text-sm text-slate-500 mb-6">
                    Zarządzaj wyłącznie układem maszyn, buforów i połączeń (bez bazy produktów).
                </p>

                <div className="space-y-4">
                    <FileInput 
                        label="Importuj Układ Linii (.json)" 
                        type="json_config" 
                        onFileSelected={handleFileParse} 
                        accept=".json"
                    />
                    <button 
                        onClick={exportConfigOnly} 
                        className="w-full h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300 transition-colors flex items-center justify-center gap-2"
                    >
                        <Save size={16} />
                        Eksportuj tylko układ
                    </button>
                </div>
            </div>

        </div> 
    ); 
};