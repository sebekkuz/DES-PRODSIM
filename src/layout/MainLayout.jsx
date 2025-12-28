import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = ({ children, menuItems, activeModule, onModuleChange }) => {
  // Domyślnie menu rozwinięte (collapsed = false)
  const [collapsed, setCollapsed] = useState(false);

  const activeItem = menuItems.find(item => item.id === activeModule);
  const currentTitle = activeItem ? activeItem.name : 'ProdSim';

  return (
    <div className="min-h-full bg-slate-50/50">
      {/* Sidebar */}
      <Sidebar 
        menuItems={menuItems} 
        activeId={activeModule} 
        onMenuClick={onModuleChange}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      {/* Kontener Główny - Dynamiczny padding 
         Gdy zwinięty: pl-20 (80px)
         Gdy rozwinięty: pl-64 (256px) 
      */}
      <div 
        className={`
            flex flex-col min-h-screen transition-all duration-300 ease-in-out
            ${collapsed ? 'pl-20' : 'pl-64'}
        `}
      >
        <Header title={currentTitle} />

        <main className="py-8">
          <div className="px-6 lg:px-8 max-w-[1920px] mx-auto">
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