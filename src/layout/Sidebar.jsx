import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  LayoutDashboard, 
  Settings, 
  Upload, 
  FileBarChart, 
  Network, 
  PlayCircle,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';

const Sidebar = () => {
  const { activeModule, setActiveModule } = useApp();
  // Stan: true = menu rozwinięte (teksty), false = menu zwinięte (same ikony)
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <aside 
      className={`
        bg-white border-r border-slate-200 flex flex-col py-6 gap-4 shrink-0 z-50 h-screen shadow-sm transition-all duration-300 ease-in-out
        ${isExpanded ? 'w-64' : 'w-20'}
      `}
    >
      
      {/* --- LOGO --- */}
      <div className={`flex items-center mb-2 transition-all duration-300 ${isExpanded ? 'px-6 gap-4' : 'justify-center px-0'}`}>
        {/* Ikona Logo */}
        <div className="w-10 h-10 shrink-0 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm transition-transform hover:scale-105">
           <span className="font-bold text-xl">P</span>
        </div>
        
        {/* Tekst Logo (widoczny tylko gdy rozwinięte) */}
        <div className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${isExpanded ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>
            <h1 className="font-bold text-slate-800 text-lg leading-tight">ProdSim</h1>
            <p className="text-[10px] text-slate-400 font-mono">v3.0.2</p>
        </div>
      </div>

      {/* --- MENU --- */}
      <nav className="flex-1 flex flex-col gap-2 w-full px-3 overflow-y-auto overflow-x-hidden">
        
        <SidebarItem 
          id="import" 
          icon={<Upload size={20} />} 
          label="Import Danych" 
          active={activeModule === 'import'} 
          onClick={setActiveModule}
          expanded={isExpanded}
        />

        <SidebarItem 
          id="canvas" 
          icon={<LayoutDashboard size={20} />} 
          label="Edytor Linii" 
          active={activeModule === 'canvas'} 
          onClick={setActiveModule}
          expanded={isExpanded}
        />

        <SidebarItem 
          id="simulation" 
          icon={<Settings size={20} />} 
          label="Symulacja" 
          active={activeModule === 'simulation'} 
          onClick={setActiveModule}
          expanded={isExpanded}
        />

        <SidebarItem 
          id="realtime" 
          icon={<PlayCircle size={20} />} 
          label="Odtwarzacz" 
          active={activeModule === 'realtime'} 
          onClick={setActiveModule}
          expanded={isExpanded}
        />

        {/* Separator */}
        <div className={`h-[1px] bg-slate-100 my-2 mx-2 transition-opacity ${isExpanded ? 'opacity-100' : 'opacity-50'}`}></div>

        <SidebarItem 
          id="wyniki" 
          icon={<FileBarChart size={20} />} 
          label="Wyniki" 
          active={activeModule === 'wyniki'} 
          onClick={setActiveModule}
          expanded={isExpanded}
        />
        
        <SidebarItem 
          id="routing" 
          icon={<Network size={20} />} 
          label="Routing" 
          active={activeModule === 'routing'} 
          onClick={setActiveModule}
          expanded={isExpanded}
        />

      </nav>

      {/* --- PRZYCISK ZWIŃ/ROZWIŃ (NA DOLE) --- */}
      <div className="px-3 mt-auto">
        <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className={`
            flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all border border-transparent hover:border-slate-200
            ${isExpanded ? 'w-full py-2 bg-slate-50/50' : 'w-10 h-10 mx-auto'}
            `}
            title={isExpanded ? "Zwiń menu" : "Rozwiń menu"}
        >
            {isExpanded ? <ChevronsLeft size={20} /> : <ChevronsRight size={20} />}
        </button>
      </div>

    </aside>
  );
};

// --- KOMPONENT ELEMENTU MENU ---
const SidebarItem = ({ id, icon, label, active, onClick, expanded }) => (
  <button
    onClick={() => onClick(id)}
    className={`
      flex items-center gap-3 transition-all duration-200 group relative rounded-xl
      ${expanded 
        ? 'w-full px-3 py-3 justify-start' // Styl rozwinięty (szeroki)
        : 'w-10 h-10 justify-center mx-auto' // Styl zwinięty (kwadratowa ikona)
      }
      ${active 
        ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
        : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
      }
    `}
  >
    {/* Ikona */}
    <span className="shrink-0 transition-transform duration-200 group-hover:scale-105">
      {icon}
    </span>

    {/* Etykieta (Tekst) - Ukrywana przy zwinięciu */}
    <span 
      className={`
        whitespace-nowrap overflow-hidden transition-all duration-200 font-medium text-sm origin-left
        ${expanded ? 'w-auto opacity-100 scale-100 translate-x-0' : 'w-0 opacity-0 scale-90 -translate-x-2'}
      `}
    >
      {label}
    </span>

    {/* Tooltip (Dymek) - Pokazuje się TYLKO gdy menu jest ZWINIĘTE (!expanded) */}
    {!expanded && (
      <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[60] shadow-xl border border-slate-700 animate-in fade-in slide-in-from-left-2 duration-200">
        {label}
        {/* Strzałeczka tooltipa */}
        <span className="absolute top-1/2 -left-1 -mt-1 border-4 border-transparent border-r-slate-800"></span>
      </span>
    )}
  </button>
);

export default Sidebar;