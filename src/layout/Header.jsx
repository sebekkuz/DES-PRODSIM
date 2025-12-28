import React from 'react';
import { Search, Bell, UserCircle } from 'lucide-react';

const Header = () => {
  return (
    <header className="h-16 px-6 flex items-center justify-between bg-white/80 backdrop-blur-md border-b border-border sticky top-0 z-10">
      {/* Breadcrumbs / Page Title */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">Symulacja</span>
        <span className="text-slate-300">/</span>
        <h1 className="text-slate-800 font-semibold text-sm">Główny Scenariusz Produkcji</h1>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        {/* Search Input Placeholder */}
        <div className="relative hidden md:block group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={16} />
          <input 
            type="text" 
            placeholder="Szukaj węzła..." 
            className="pl-9 pr-4 py-1.5 bg-slate-50 border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-primary w-64 transition-all"
          />
        </div>

        <button className="p-2 text-slate-400 hover:text-slate-600 relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
        </button>
        
        <div className="h-8 w-px bg-slate-200 mx-1"></div>
        
        <div className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
          <UserCircle size={32} className="text-slate-400" />
          <div className="hidden md:block text-xs text-right">
            <p className="font-semibold text-slate-700">Operator</p>
            <p className="text-slate-400">Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;