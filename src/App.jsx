import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { SimulationLogViewer } from './components/SharedComponents';

// Import Layoutu (Nowość)
import MainLayout from './layout/MainLayout';

// Import Modułów (Bez zmian)
import ModuleImport from './components/ModuleImport';
import ModuleRouting from './components/ModuleRouting';
import ModuleVisualization from './components/ModuleVisualization';
import ModuleValidator from './components/ModuleValidator';
import ModuleSimulation from './components/ModuleSimulation';
import ModuleResults from './components/ModuleResults';
import { RealTimeViewer } from './components/RealTimeViewer';
import { GanttViewer } from './components/GanttViewer';

const AppContent = () => {
    // 1. ZACHOWANIE STANU I LOGIKI
    const { activeModule, setActiveModule, simulationLog, simulationConfig, simulationResults } = useApp();
    
    // Definicja menu (przekażemy ją do Sidebara)
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
    
    // Renderowanie warunkowe (Bez zmian)
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
    
    // 2. NOWA STRUKTURA (WRAPPER)
    // Zamiast starego <nav> i <div>, używamy <MainLayout>
    return (
        <MainLayout 
            menuItems={modules} 
            activeModule={activeModule} 
            onModuleChange={setActiveModule}
        >
            {/* Wstrzyknięcie widoku modułu jako 'children' */}
            {renderModule()}
            
            {/* Log Viewer jako element globalny (zachowane warunki wyświetlania) */}
            {activeModule !== 'realtime' && activeModule !== 'gantt' && (
                <div className="mt-6">
                    <SimulationLogViewer log={simulationLog} />
                </div>
            )}
        </MainLayout>
    );
};

export default function App() {
    return (
        <AppProvider>
            <AppContent />
        </AppProvider>
    );
}