import React from 'react';

const Sidebar = ({ menuItems = [], activeId, onMenuClick }) => {
  return (
    <aside className="w-64 bg-surface h-full border-r border-border shadow-glass flex flex-col z-20">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <h1 className="text-xl font-bold text-primary tracking-tight">ProdSim v2</h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {menuItems.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onMenuClick && onMenuClick(item.id)}
              className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group
                ${isActive 
                  ? 'bg-primary text-white shadow-md' 
                  : 'text-text-body hover:bg-background hover:text-primary'
                }`}
            >
              <span className={`mr-3 text-lg transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-secondary/80'}`}>
                {item.icon}
              </span>
              {item.name}
            </button>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-border">
        <div className="text-xs text-text-muted text-center">
          UI Wrapper System v2.0
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;