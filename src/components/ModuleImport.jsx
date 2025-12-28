import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { useApp } from '../context/AppContext';
import { FileInput, StatCard } from './SharedComponents';

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

    return ( 
        <div className="max-w-6xl mx-auto space-y-6 pb-10">
            <div className="bg-blue-50 p-6 rounded-lg shadow-lg border-l-4 border-blue-500">
                <h3 className="text-xl font-bold mb-2 text-blue-800">Zarządzanie Pełnym Scenariuszem</h3>
                <p className="text-sm text-blue-600 mb-4">
                    Zapisz lub wczytaj <strong>kompletny stan aplikacji</strong> (Baza produktów, MRP, Konfiguracja Linii, Ustawienia).
                    Idealne do tworzenia punktów przywracania.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <button onClick={exportFullScenario} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors flex justify-center items-center">
                        💾 Zapisz Pełny Scenariusz (.json)
                     </button>
                     <FileInput label="Wczytaj Pełny Scenariusz (.json)" type="json_full" onFileSelected={handleFileParse} accept=".json"/>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-4 border-b pb-2">1. Import Danych Bazowych (CSV)</h3>
                    <div className="space-y-4">
                        <FileInput label="Funkcje / Komponenty (CSV)" type="functions" onFileSelected={handleFileParse} />
                        <FileInput label="Obudowy (CSV)" type="casings" onFileSelected={handleFileParse} />
                        <FileInput label="Plan Produkcyjny MRP (CSV)" type="mrp" onFileSelected={handleFileParse} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-4 border-b pb-2">2. Konfiguracja Linii Produkcyjnej</h3>
                    <p className="text-xs text-gray-500 mb-4">Tylko stacje, bufory, połączenia i pracownicy (bez produktów).</p>
                    <div className="space-y-4">
                        <button onClick={exportConfigOnly} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded border border-gray-300">
                            📤 Eksportuj Układ Linii (.json)
                        </button>
                         <FileInput label="Importuj Układ Linii (.json)" type="json_config" onFileSelected={handleFileParse} accept=".json"/>
                    </div>
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-4 border-b pb-2">Baza Danych w Aplikacji (Podgląd i Zapis)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard title="Funkcje" stats={stats.functions} onExport={exportDbOnly} />
                    <StatCard title="Obudowy" stats={stats.casings} onExport={exportDbOnly} />
                    <StatCard title="Plan MRP" stats={stats.mrp} onExport={exportMrpOnly} />
                </div>
            </div>
        </div> 
    ); 
};