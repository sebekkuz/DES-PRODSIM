import React, { useState, useEffect, createContext, useContext, useRef } from 'react';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [activeModule, setActiveModule] = useState('import');
    
    // Główny stan konfiguracji fabryki
    const [simulationConfig, setSimulationConfig] = useState({
        stations: [],    
        buffers: [],     
        workerPools: [], 
        toolPools: [],   
        flows: [],
        workerFlows: [], 
        routings: {} 
    });
    
    // Ustawienia globalne
    const [simulationSettings, setSimulationSettings] = useState({
        startDate: '18-11-2025',
        targetTakt: 0,
        qualitySettings: {}, 
        packingSettings: {},
        assemblySequence: [],
        shifts: {
            1: { active: true, days: 5, start: '06:00', end: '14:00' },
            2: { active: false, days: 5, start: '14:00', end: '22:00' },
            3: { active: false, days: 5, start: '22:00', end: '06:00' },
            4: { active: false, days: 2, start: '08:00', end: '16:00' } 
        }
    });
    
    // Baza danych produktów
    const [db, setDb] = useState({ functions: {}, casings: {} });
    
    // Plan Produkcyjny
    const [mrp, setMrp] = useState([]); 
    
    const workerRef = useRef(null);
    const [simulationLog, setSimulationLog] = useState(["Oczekuję na uruchomienie symulacji..."]);
    const [simulationResults, setSimulationResults] = useState(null);

    // Inicjalizacja Workera
    useEffect(() => {
        const cacheBuster = Date.now();
        // Worker jest w folderze public, więc ścieżka to po prostu nazwa pliku
        workerRef.current = new Worker(`simulation_worker.js?v=${cacheBuster}`);
        
        workerRef.current.onmessage = (e) => {
            const { type, payload } = e.data;
            
            if (type === 'SIMULATION_LOG') {
                setSimulationLog(payload);
            } else if (type === 'SIMULATION_RESULTS') {
                console.log("Wyniki symulacji:", payload);
                setSimulationResults(payload);
                if (!payload.error) {
                     setActiveModule('wyniki');
                } else {
                     alert("Błąd symulacji: " + payload.error);
                }
            } else if (type === 'FATAL_ERROR') {
                 console.error("Błąd krytyczny silnika:", payload);
                 setSimulationLog(["BŁĄD KRYTYCZNY:", ...payload]);
            }
        };
        return () => workerRef.current.terminate();
    }, []);

    const configKeyMap = {
        station: 'stations',
        buffer: 'buffers',
        workerPool: 'workerPools',
        toolPool: 'toolPools',
        flow: 'flows',
        workerFlow: 'workerFlows'
    };

    const downloadFile = (data, filename, type = 'application/json') => {
        const fileData = JSON.stringify(data, null, 2);
        const blob = new Blob([fileData], { type: type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const value = {
        activeModule,
        setActiveModule,
        simulationConfig,
        setSimulationConfig,
        simulationSettings, 
        setSimulationSettings,
        db,
        setDb,
        mrp,
        setMrp,
        simulationLog,
        simulationResults, 
        
        exportFullScenario: () => {
            const fullData = {
                config: simulationConfig,
                settings: simulationSettings,
                db: db,
                mrp: mrp
            };
            downloadFile(fullData, `ProdSim_PEŁNY_SCENARIUSZ_${Date.now()}.json`);
        },
        exportConfigOnly: () => downloadFile(simulationConfig, `ProdSim_KONFIGURACJA_${Date.now()}.json`),
        exportSettingsOnly: () => downloadFile(simulationSettings, `ProdSim_USTAWIENIA_${Date.now()}.json`),
        exportDbOnly: () => downloadFile(db, `ProdSim_BAZA_PRODUKTOW_${Date.now()}.json`),
        exportMrpOnly: () => downloadFile(mrp, `ProdSim_PLAN_MRP_${Date.now()}.json`),
        exportRoutingsOnly: () => downloadFile(simulationConfig.routings, `ProdSim_MARSZRUTY_${Date.now()}.json`),

        importData: (data, type) => {
            if (type === 'full') {
                if (data.config) setSimulationConfig(data.config);
                if (data.settings) setSimulationSettings(prev => ({...prev, ...data.settings})); 
                if (data.db) setDb(data.db);
                if (data.mrp) setMrp(data.mrp);
                alert("Wczytano pełny scenariusz.");
            } else if (type === 'config') {
                setSimulationConfig(prev => ({...prev, ...data}));
                alert("Wczytano konfigurację linii.");
            } else if (type === 'settings') {
                setSimulationSettings(prev => ({...prev, ...data}));
                alert("Wczytano ustawienia globalne.");
            } else if (type === 'routings') {
                setSimulationConfig(prev => ({...prev, routings: data}));
                alert("Wczytano marszruty.");
            }
        },

        addConfigItem: (type, itemData) => {
            const key = configKeyMap[type];
            if (!key) return console.error(`Nieznany typ konfiguracji: ${type}`);
            let newId = null;
            setSimulationConfig(prev => {
                const defaultPosition = (type === 'station' || type === 'buffer' || type === 'workerPool') ? { x: 50, y: 50 } : {};
                const newItem = { id: `${type.slice(0,3)}_${Date.now()}`, ...defaultPosition, ...itemData };
                newId = newItem.id;
                
                if (type === 'flow' || type === 'workerFlow') {
                    const list = (type === 'flow') ? prev.flows : prev.workerFlows;
                    const exists = list.find(f => f.from === newItem.from && f.to === newItem.to);
                    if (exists) { alert("Taki przepływ już istnieje."); newId = null; return prev; }
                }
                if (type === 'flow' || type === 'workerFlow') {
                     delete newItem.name; 
                }

                if (key in prev) return { ...prev, [key]: [...prev[key], newItem] };
                return prev;
            });
            return newId;
        },
        
        deleteConfigItem: (type, itemId) => {
            const key = configKeyMap[type];
            if (!key) return console.error(`Nieznany typ konfiguracji: ${type}`);
            
            setSimulationConfig(prev => {
                const updatedMainList = prev[key].filter(item => item.id !== itemId);
                
                let newFlows = (type === 'flow') ? updatedMainList : prev.flows;
                let newWorkerFlows = (type === 'workerFlow') ? updatedMainList : prev.workerFlows;
                let newWorkerPools = (type === 'workerPool') ? updatedMainList : prev.workerPools;
                let newToolPools = (type === 'toolPool') ? updatedMainList : prev.toolPools;

                if (type === 'station' || type === 'buffer' || type === 'workerPool') {
                    if (type === 'station' || type === 'buffer') {
                        newFlows = newFlows.filter(f => f.from !== itemId && f.to !== itemId);
                    }
                    if (type === 'station') {
                         newWorkerFlows = newWorkerFlows.filter(wf => wf.to !== itemId);
                         newWorkerPools = newWorkerPools.map(pool => ({
                             ...pool,
                             assignedStations: (pool.assignedStations || []).filter(stationId => stationId !== itemId)
                         }));
                    }
                    if (type === 'workerPool') {
                        newWorkerFlows = newWorkerFlows.filter(wf => wf.from !== itemId);
                    }
                }
                if (type === 'flow') {
                     newToolPools = newToolPools.map(pool => ({
                         ...pool,
                         assignedFlows: (pool.assignedFlows || []).filter(flowId => flowId !== itemId)
                     }));
                }
                     
                return { 
                    ...prev, 
                    [key]: updatedMainList, 
                    flows: newFlows, 
                    workerPools: newWorkerPools, 
                    toolPools: newToolPools,
                    workerFlows: newWorkerFlows
                };
            });
        },
        
        updateConfigItem: (type, itemId, updates) => {
            const key = configKeyMap[type];
            if (!key) return console.error(`Nieznany typ konfiguracji: ${type}`);
            setSimulationConfig(prev => {
                if (key in prev) {
                    const newList = prev[key].map(item => 
                        item.id === itemId ? { ...item, ...updates } : item
                    );
                    return { ...prev, [key]: newList };
                }
                return prev;
            });
        },
        
        updateRouting: (routingKey, operations) => {
             setSimulationConfig(prev => ({
                ...prev,
                routings: {
                    ...prev.routings,
                    [routingKey]: operations
                }
            }));
        },
        
        runSimulation: () => {
            setSimulationLog(["[UI] Otrzymano polecenie uruchomienia. Wysyłanie danych do silnika..."]);
            setSimulationResults(null); 
            if (workerRef.current) {
                 workerRef.current.postMessage({ 
                    type: 'START_SIMULATION', 
                    payload: { 
                        config: simulationConfig, 
                        db: db, 
                        mrp: mrp,
                        settings: simulationSettings
                    }
                });
            }
        }
    };

    return ( <AppContext.Provider value={value}>{children}</AppContext.Provider> );
};

export const useApp = () => useContext(AppContext);