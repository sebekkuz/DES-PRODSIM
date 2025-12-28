import React, { useState } from 'react';
import { 
  Factory, 
  Box, 
  Users, 
  Truck, 
  Settings, 
  Plus, 
  Trash2, 
  X,
  Edit3,
  ChevronRight,
  Info,
  ArrowLeft
} from 'lucide-react';

const LineEditor = () => {
  const [activeTab, setActiveTab] = useState('workstations');

  const renderContent = () => {
    switch (activeTab) {
      case 'workstations': return <WorkstationsModule />;
      case 'buffers':      return <PlaceholderModule title="Bufory Magazynowe" icon={Box} />;
      case 'resources':    return <PlaceholderModule title="Zasoby Ludzkie" icon={Users} />;
      case 'logistics':    return <PlaceholderModule title="Logistyka (Trasy)" icon={Truck} />;
      default:             return <WorkstationsModule />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200 font-sans">
      {/* --- NAGŁÓWEK --- */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0 h-14 z-20">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-600" />
          Edytor Linii
        </h2>
        <div className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">
            v3.0.2
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* --- PASEK MENU --- */}
        {/* Usunęliśmy overflow-y-auto, aby tooltipy mogły wystawać poza pasek */}
        <aside className="w-16 bg-white border-r border-slate-200 flex flex-col shrink-0 z-10">
          <nav className="p-2 space-y-2 flex-1 flex flex-col items-center">
            <SidebarIcon id="workstations" icon={Factory} active={activeTab === 'workstations'} onClick={setActiveTab} tooltip="Stacje Robocze" />
            <SidebarIcon id="buffers" icon={Box} active={activeTab === 'buffers'} onClick={setActiveTab} tooltip="Bufory Magazynowe" />
            <SidebarIcon id="resources" icon={Users} active={activeTab === 'resources'} onClick={setActiveTab} tooltip="Zasoby Ludzkie" />
            <SidebarIcon id="logistics" icon={Truck} active={activeTab === 'logistics'} onClick={setActiveTab} tooltip="Logistyka i Trasy" />
          </nav>
        </aside>

        {/* --- OBSZAR ROBOCZY --- */}
        <main className="flex-1 overflow-hidden bg-slate-50 relative w-full">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

// --- MODUŁ STACJI ---
const WorkstationsModule = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingStation, setEditingStation] = useState(null);

  // Dane testowe
  const [stations] = useState([
    { id: 1, name: 'OBUDOWA PRZYGOTOWANIE', type: 'PODMONTAŻ', cap: 2, variability: 0, failure: 0 },
    { id: 2, name: 'OBUDOWA MONTAŻ', type: 'PRODUKCJA', cap: 1, variability: 5, failure: 2 },
    { id: 3, name: 'PRZYGOTOWANIE HEX', type: 'KONTROLA', cap: 1, variability: 0, failure: 0 },
  ]);

  const handleOpenAdd = () => { setEditingStation(null); setIsPanelOpen(true); };
  const handleOpenEdit = (station) => { setEditingStation(station); setIsPanelOpen(true); };
  const handleClose = () => { setIsPanelOpen(false); setEditingStation(null); };

  return (
    <div className="h-full relative flex flex-col w-full">
      
      {/* 1. LISTA STACJI */}
      <div className="flex-1 overflow-y-auto p-5 w-full">
        <button 
            onClick={handleOpenAdd}
            className="w-full bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-700 rounded-lg p-3 mb-6 flex items-center justify-center gap-2 transition-all shadow-sm group"
        >
            <div className="bg-blue-100 p-1 rounded-full group-hover:scale-110 transition-transform">
              <Plus size={16} />
            </div>
            <span className="font-semibold text-sm">Dodaj Stanowisko</span>
        </button>

        <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">Lista Stacji ({stations.length})</h3>
        </div>

        <div className="space-y-3 pb-20">
          {stations.map((station) => (
            <div 
                key={station.id} 
                onClick={() => handleOpenEdit(station)}
                className="group bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer relative"
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-slate-800 text-sm leading-tight group-hover:text-blue-700 transition-colors break-words">
                      {station.name}
                  </h4>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <Badge>{station.type}</Badge>
                    <Badge color="gray">CAP: {station.cap}</Badge>
                  </div>
                </div>
                <div className="text-slate-300 group-hover:text-blue-500 transition-colors pt-1">
                    <ChevronRight size={18} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. PEŁNOEKRANOWY PANEL EDYCJI */}
      <div className={`absolute inset-0 bg-white z-30 flex flex-col transition-transform duration-300 transform ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          
          {/* Nagłówek Panelu */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
              <button onClick={handleClose} className="p-1.5 -ml-2 rounded-full hover:bg-slate-200 text-slate-500 transition">
                  <ArrowLeft size={20} />
              </button>
              <h3 className="font-bold text-slate-800 flex-1">
                  {editingStation ? 'Edycja Stacji' : 'Nowa Stacja'}
              </h3>
              {editingStation && (
                  <button className="text-red-500 hover:bg-red-50 p-2 rounded transition" title="Usuń">
                      <Trash2 size={18} />
                  </button>
              )}
          </div>

          {/* Formularz */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <InputGroup label="Nazwa Stacji" placeholder="np. Montaż Obudowy" defaultValue={editingStation?.name} />
              
              <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 uppercase">Typ Stanowiska</label>
                  <select 
                      className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white py-3 px-3 border outline-none"
                      defaultValue={editingStation?.type || 'PODMONTAŻ'}
                  >
                      <option>PODMONTAŻ</option>
                      <option>PRODUKCJA</option>
                      <option>KONTROLA JAKOŚCI</option>
                      <option>PAKOWANIE</option>
                  </select>
              </div>

              <div className="grid grid-cols-2 gap-5">
                  <InputGroup label="Pojemność (Cap)" type="number" defaultValue={editingStation?.cap || 1} />
                  <InputGroup label="Liczba Pracowników" type="number" defaultValue={1} />
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                      <Info size={14} className="text-blue-500" />
                      <h4 className="text-xs font-bold text-slate-600 uppercase">Parametry Symulacji</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                      <InputGroup label="Zmienność (%)" type="number" defaultValue={editingStation?.variability || 0} />
                      <InputGroup label="Awaryjność (%)" type="number" defaultValue={editingStation?.failure || 0} />
                  </div>
              </div>
          </div>

          {/* Stopka */}
          <div className="p-5 border-t border-slate-100 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold shadow-md transition active:scale-[0.98]">
                  {editingStation ? 'Zapisz Zmiany' : 'Utwórz Stację'}
              </button>
          </div>
      </div>
    </div>
  );
};

// --- KOMPONENTY UI ---

// Zaktualizowany SidebarIcon z Custom Tooltipem
const SidebarIcon = ({ id, icon: Icon, active, onClick, tooltip }) => (
  <button
    onClick={() => onClick(id)}
    className={`
      group relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200
      ${active 
        ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
      }
    `}
  >
    <Icon size={20} />
    
    {/* DYMEK (TOOLTIP) */}
    {/* absolute left-full -> ustawia dymek po prawej stronie przycisku */}
    <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-md opacity-0 invisible group-hover:visible group-hover:opacity-100 transition-all duration-200 whitespace-nowrap z-50 pointer-events-none shadow-xl transform translate-x-[-5px] group-hover:translate-x-0">
      {tooltip}
      {/* Mały trójkąt wskazujący na ikonę */}
      <div className="absolute top-1/2 -left-1 -mt-1 border-4 border-transparent border-r-slate-800" />
    </div>
  </button>
);

const InputGroup = ({ label, ...props }) => (
  <div>
    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase">{label}</label>
    <input 
      className="w-full text-sm rounded-lg border py-3 px-3 outline-none transition-all shadow-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      {...props} 
    />
  </div>
);

const Badge = ({ children, color = 'blue' }) => {
    const styles = {
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        gray: 'bg-slate-100 text-slate-600 border-slate-200',
    };
    return (
        <span className={`text-[10px] font-bold px-2 py-1 rounded border whitespace-nowrap ${styles[color]}`}>
            {children}
        </span>
    );
};

const PlaceholderModule = ({ title, icon: Icon }) => (
  <div className="h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
    <Icon className="w-10 h-10 mb-2 opacity-30" />
    <span className="text-sm font-medium">{title}</span>
  </div>
);

export default LineEditor;