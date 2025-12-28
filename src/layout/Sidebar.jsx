import React from 'react';
import { ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const Sidebar = ({ menuItems = [], activeId, onMenuClick, collapsed, setCollapsed }) => {
  // Mapowanie collapsed (z MainLayout) na isExpanded (logika stylów)
  const isExpanded = !collapsed;

  return (
    <aside 
      className={`
        fixed inset-y-0 z-50 flex flex-col h-screen shrink-0
        bg-white border-r border-slate-200 shadow-sm transition-all duration-300 ease-in-out
        ${isExpanded ? 'w-64' : 'w-20'}
      `}
    >
      {/* --- LOGO --- */}
      <div className={`flex items-center py-6 transition-all duration-300 ${isExpanded ? 'px-6 gap-4' : 'justify-center px-0'}`}>
        {/* Ikona Logo */}
        <div className="w-10 h-10 shrink-0 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm transition-transform hover:scale-105">
           <span className="font-bold text-xl">P</span>
        </div>
        
        {/* Tekst Logo */}
        <div className={`flex flex-col overflow-hidden transition-all duration-300 ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 hidden'}`}>
          <span className="font-bold text-slate-800 tracking-tight text-lg leading-none">ProdSim</span>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">v2.0 Pro</span>
        </div>
      </div>

      {/* --- MENU --- */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {menuItems.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onMenuClick && onMenuClick(item.id)}
              title={!isExpanded ? item.name : ''} // Tooltip systemowy po najechaniu
              className={`
                group relative flex items-center transition-all duration-200 rounded-xl font-medium
                ${isExpanded 
                  ? 'w-full px-4 py-3 gap-3'  // Styl rozwinięty
                  : 'w-10 h-10 justify-center mx-auto' // Styl zwinięty (kwadrat)
                }
                ${isActive 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                }
              `}
            >
              {/* Ikona */}
              <span className={`shrink-0 transition-transform duration-200 ${!isActive && 'group-hover:scale-110'}`}>
                {/* Obsługa ikon: Jeśli to string (emoji) - wyświetl jako tekst. Jeśli komponent - renderuj. */}
                {typeof item.icon === 'string' ? <span className="text-lg">{item.icon}</span> : item.icon}
              </span>

              {/* Tekst Menu */}
              <span 
                className={`
                  whitespace-nowrap overflow-hidden transition-all duration-200 origin-left text-sm
                  ${isExpanded ? 'w-auto opacity-100 scale-100 ml-1' : 'w-0 opacity-0 scale-90 hidden'}
                `}
              >
                {item.name}
              </span>

              {/* Strzałka (tylko gdy aktywne i rozwinięte) */}
              {isActive && isExpanded && (
                <ChevronRight className="ml-auto w-4 h-4 text-white/80" />
              )}
              
              {/* Tooltip (Hover) dla zwiniętego menu - Opcjonalny bajer */}
              {!isExpanded && (
                <div className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1.5 rounded-md opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 pointer-events-none z-50 whitespace-nowrap shadow-xl">
                  {item.name}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* --- STOPKA (Toggle) --- */}
      <div className="p-4 border-t border-slate-100">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`
            flex items-center justify-center w-full rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-200
            ${isExpanded ? 'h-10 px-4 gap-2' : 'h-10 w-10 mx-auto'}
          `}
        >
          {isExpanded ? <ChevronsLeft className="w-4 h-4" /> : <ChevronsRight className="w-4 h-4" />}
          {isExpanded && <span className="text-sm font-medium">Zwiń panel</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;