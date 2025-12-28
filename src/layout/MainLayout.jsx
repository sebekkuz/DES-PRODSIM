import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = ({ children, menuItems, activeModule, onModuleChange }) => {
  // Znajdź nazwę aktywnego modułu do wyświetlenia w Headerze
  const activeItem = menuItems.find(item => item.id === activeModule);
  const currentTitle = activeItem ? activeItem.name : 'ProdSim';

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden text-text-main font-sans">
      {/* LEWA STRONA: Sidebar */}
      <Sidebar 
        menuItems={menuItems} 
        activeId={activeModule} 
        onMenuClick={onModuleChange} 
      />

      {/* PRAWA STRONA: Header + Content */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        <Header title={currentTitle} />
        
        {/* Główny kontener na treść (children = renderModule()) */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="max-w-[1600px] mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;