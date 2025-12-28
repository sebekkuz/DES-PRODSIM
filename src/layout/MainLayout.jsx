import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = ({ children }) => {
  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        
        <main className="flex-1 relative overflow-hidden">
          {/* Tło w kropki (Dot Pattern) */}
          <div className="absolute inset-0 z-0 opacity-[0.4]"
               style={{
                 backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
                 backgroundSize: '24px 24px'
               }}>
          </div>
          
          {/* Obszar roboczy (Canvas Container) */}
          <div className="relative z-0 h-full w-full overflow-auto">
             {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;