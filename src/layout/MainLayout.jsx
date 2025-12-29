import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = ({ children, menuItems, activeModule, onModuleChange }) => {
  // Stan zwinięcia paska bocznego
  const [collapsed, setCollapsed] = useState(false);

  const activeItem = menuItems.find(item => item.id === activeModule);
  const currentTitle = activeItem ? activeItem.name : 'ProdSim';

  return (
    // FIX: overflow-x-hidden zapobiega pojawianiu się poziomego paska przewijania
    <div className="min-h-screen bg-slate-50/50 overflow-x-hidden">
      
      {/* Sidebar - Fixed Left */}
      <Sidebar 
        menuItems={menuItems} 
        activeId={activeModule} 
        onMenuClick={onModuleChange}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      {/* Main Content Wrapper */}
      <div 
        className={`
            flex flex-col min-h-screen transition-all duration-300 ease-in-out
            ${collapsed ? 'pl-20' : 'pl-64'}
        `}
      >
        <Header title={currentTitle} />

        <main className="py-8 flex-1">
          <div className="px-6 lg:px-8 max-w-[1920px] mx-auto w-full">
             {/* Animacja wejścia treści */}
             <div className="fade-in-up">
                {children}
             </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;