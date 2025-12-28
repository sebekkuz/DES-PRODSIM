import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { SimulationLogViewer } from './components/SharedComponents';

// Import Modułów
import ModuleImport from './components/ModuleImport';
import ModuleRouting from './components/ModuleRouting';
import ModuleVisualization from './components/ModuleVisualization';
import ModuleValidator from './components/ModuleValidator';
import ModuleSimulation from './components/ModuleSimulation';
import ModuleResults from './components/ModuleResults';

// Te dwa pliki tworzyłeś w poprzednim kroku:
import { RealTimeViewer } from './components/RealTimeViewer';
import { GanttViewer } from './components/GanttViewer';

const AppContent = () => {
    const { activeModule, setActiveModule, simulationLog, simulationConfig, simulationResults } = useApp();
    
    const modules = [ 
        { id: 'import', name: 'Import/Eksport', icon: '📂' }, 
        { id: 'marszruty', name: 'Marszruty', icon: '🗺️' }, 
        { id: 'wizualizacja', name: 'Konfiguracja Linii', icon: '🏭' }, 
        { id: 'validator', name: 'Audyt Gemini', icon: '🕵️‍♀️' }, 
        { id: 'symulacja', name: 'Ustawienia Symulacji', icon: '⚙️' }, 
        { id: 'wyniki', name: 'Wyniki i KPI', icon: '📊' }, 
        { id: 'realtime', name: 'Real-time Flow', icon: '📡' }, 
        { id: 'gantt', name: 'Harmonogram (Gantt)', icon: '📅' },
    ];
    
    const renderModule = () => {
        switch (activeModule) {
            case 'import': return <ModuleImport />;
            case 'marszruty': return <ModuleRouting />;
            case 'wizualizacja': return <ModuleVisualization />;
            case 'validator': return <ModuleValidator />; 
            case 'symulacja': return <ModuleSimulation />;
            case 'wyniki': return <ModuleResults />;
            case 'realtime': return <RealTimeViewer config={simulationConfig} simulationData={simulationResults} />;
            case 'gantt': return <GanttViewer config={simulationConfig} simulationData={simulationResults} />;
            default: return <div>Wybierz moduł</div>;
        }
    };
    
    return (
        <div className="flex flex-col h-screen bg-gray-100">
            <nav className="bg-gray-800 text-white p-2 flex items-center space-x-2 shadow-md z-20 shrink-0">
                <h1 className="text-xl font-bold px-3">ProdSim v2</h1>
                <div className="flex-1 flex items-center space-x-1 overflow-x-auto">
                    {modules.map(mod => ( 
                        <button key={mod.id} onClick={() => setActiveModule(mod.id)} className={`flex items-center px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap ${ activeModule === mod.id ? 'bg-blue-600' : 'hover:bg-gray-700' }`}> 
                            <span className="mr-2 text-lg">{mod.icon}</span> <span>{mod.name}</span> 
                        </button> 
                    ))}
                </div>
            </nav>
            <main className="flex-1 overflow-y-auto p-4 md:p-6 relative"> {renderModule()} </main>
            
            {activeModule !== 'realtime' && activeModule !== 'gantt' && <SimulationLogViewer log={simulationLog} />}
        </div>
    );
};

export default function App() {
    return (
        <AppProvider>
            <AppContent />
        </AppProvider>
    );
}