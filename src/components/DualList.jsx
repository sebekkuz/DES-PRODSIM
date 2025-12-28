import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Funkcja pomocnicza do bezpiecznego łączenia klas
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function DualList({ 
  available = [], 
  assigned = [], 
  onChange,
  leftTitle = "Dostępne zasoby",
  rightTitle = "Przypisane do stacji"
}) {
  // Stany dla zaznaczonych elementów (tymczasowe, przed przeniesieniem)
  const [checkedAvailable, setCheckedAvailable] = useState([]);
  const [checkedAssigned, setCheckedAssigned] = useState([]);

  // Obsługa zaznaczania (toggle)
  const handleToggle = (item, side) => {
    const list = side === 'left' ? checkedAvailable : checkedAssigned;
    const setList = side === 'left' ? setCheckedAvailable : setCheckedAssigned;
    
    const currentIndex = list.indexOf(item);
    const newChecked = [...list];

    if (currentIndex === -1) {
      newChecked.push(item);
    } else {
      newChecked.splice(currentIndex, 1);
    }
    setList(newChecked);
  };

  // Logika przenoszenia
  const moveRight = () => {
    const newAssigned = [...assigned, ...checkedAvailable];
    const newAvailable = available.filter(i => !checkedAvailable.includes(i));
    onChange(newAvailable, newAssigned);
    setCheckedAvailable([]);
  };

  const moveLeft = () => {
    const newAvailable = [...available, ...checkedAssigned];
    const newAssigned = assigned.filter(i => !checkedAssigned.includes(i));
    onChange(newAvailable, newAssigned);
    setCheckedAssigned([]);
  };

  const moveAllRight = () => {
    onChange([], [...assigned, ...available]);
    setCheckedAvailable([]);
  };

  const moveAllLeft = () => {
    onChange([...available, ...assigned], []);
    setCheckedAssigned([]);
  };

  // Sub-komponent listy
  const ListBox = ({ title, items, checkedItems, side }) => (
    <div className="flex flex-col flex-1 h-[350px] bg-surface border border-border rounded-lg shadow-card overflow-hidden">
      {/* Nagłówek listy */}
      <div className="px-4 py-3 bg-background border-b border-border flex justify-between items-center">
        <span className="font-semibold text-text-main text-sm uppercase tracking-wide">{title}</span>
        <span className="text-xs font-bold text-text-muted bg-white px-2 py-1 rounded-full border border-border">
          {items.length}
        </span>
      </div>
      
      {/* Ciało listy */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.length === 0 && (
          <div className="h-full flex items-center justify-center text-text-muted text-sm italic">
            Brak elementów
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id || item.name || JSON.stringify(item)}
            onClick={() => handleToggle(item, side)}
            className={cn(
              "cursor-pointer px-3 py-2.5 rounded-md text-sm transition-all duration-200 flex items-center gap-3 border border-transparent",
              checkedItems.includes(item)
                ? "bg-primary/10 border-primary/20 text-primary font-medium shadow-sm" 
                : "hover:bg-background text-text-body hover:text-text-main"
            )}
          >
            <input 
              type="checkbox" 
              checked={checkedItems.includes(item)}
              readOnly
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary" 
            />
            <span className="truncate">{item.name || item.label || item}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Komponent przycisku
  const ActionButton = ({ onClick, disabled, icon: Icon }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-2 rounded-lg border border-border bg-surface text-text-body hover:bg-background hover:text-primary hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:text-text-body transition-all shadow-sm active:scale-95 flex justify-center items-center"
    >
      <Icon size={18} strokeWidth={2.5} />
    </button>
  );

  return (
    <div className="flex items-center gap-4 w-full">
      <ListBox title={leftTitle} items={available} checkedItems={checkedAvailable} side="left" />
      
      <div className="flex flex-col gap-3">
        <ActionButton onClick={moveAllRight} disabled={available.length === 0} icon={ChevronsRight} />
        <ActionButton onClick={moveRight} disabled={checkedAvailable.length === 0} icon={ChevronRight} />
        <ActionButton onClick={moveLeft} disabled={checkedAssigned.length === 0} icon={ChevronLeft} />
        <ActionButton onClick={moveAllLeft} disabled={assigned.length === 0} icon={ChevronsLeft} />
      </div>

      <ListBox title={rightTitle} items={assigned} checkedItems={checkedAssigned} side="right" />
    </div>
  );
}