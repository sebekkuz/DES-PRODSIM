import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { SimulationLogViewer } from './components/SharedComponents';

// Import Layoutu
import MainLayout from './layout/MainLayout';

// Import Modułów
import ModuleImport from './components/ModuleImport';
import ModuleRouting from './components/ModuleRouting';
import ModuleVisualization from './components/ModuleVisualization';
import ModuleValidator from './components/ModuleValidator';
import ModuleSimulation from './components/ModuleSimulation';
import ModuleResults from './components/ModuleResults';
import { RealTimeViewer } from './components/RealTimeViewer';
import { GanttViewer } from './components/GanttViewer';
// NOWY IMPORT:
import ModuleDatabase from './components/ModuleDatabase';

import { 
  Upload,            
  Network,           
  LayoutDashboard,   
  ShieldCheck,       
  Settings,          
  FileBarChart,      
  PlayCircle,        
  CalendarRange,
  Database // Nowa ikona
} from 'lucide-react';

const AppContent = () => {
    const { activeModule, setActiveModule, simulationLog, simulationConfig, simulationResults } = useApp();
    
    // Definicja menu
    const modules = [ 
        { 
            id: 'import', 
            name: 'Import/Eksport', 
            icon: <Upload size={20} /> 
        }, 
        // NOWY MODUŁ W MENU:
        { 
            id: 'database', 
            name: 'Baza Produktów', 
            icon: <Database size={20} /> 
        },
        { 
            id: 'marszruty', 
            name: 'Marszruty', 
            icon: <Network size={20} /> 
        }, 
        { 
            id: 'wizualizacja', 
            name: 'Konfiguracja Linii', 
            icon: <LayoutDashboard size={20} /> 
        }, 
        { 
            id: 'validator', 
            name: 'Audyt Gemini', 
            icon: <ShieldCheck size={20} /> 
        }, 
        { 
            id: 'symulacja', 
            name: 'Ustawienia Symulacji', 
            icon: <Settings size={20} /> 
        }, 
        { 
            id: 'wyniki', 
            name: 'Wyniki i KPI', 
            icon: <FileBarChart size={20} /> 
        }, 
        { 
            id: 'realtime', 
            name: 'Real-time Flow', 
            icon: <PlayCircle size={20} /> 
        }, 
        { 
            id: 'gantt', 
            name: 'Harmonogram (Gantt)', 
            icon: <CalendarRange size={20} /> 
        },
    ];
    
    // Renderowanie warunkowe
    const renderModule = () => {
        switch (activeModule) {
            case 'import': return <ModuleImport />;
            case 'database': return <ModuleDatabase />; // NOWY ROUTING
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
        <MainLayout 
            menuItems={modules} 
            activeModule={activeModule} 
            onModuleChange={setActiveModule}
        >
            {renderModule()}
            
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