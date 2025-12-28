import React, { useState, useEffect, useRef } from 'react';

// === Wyświetlanie Logów ===
export const SimulationLogViewer = ({ log }) => {
    const logEndRef = useRef(null);
    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [log]);
    return (
        <div className="bg-gray-900 text-white p-4 h-48 overflow-auto text-xs font-mono">
            <h4 className="font-bold mb-2 text-yellow-400">[Panel Logu Silnika]</h4>
            {log.map((line, index) => {
                let color = "text-gray-300";
                if (line.includes("BŁĄD") || line.includes("OSTRZEŻENIE")) color = "text-red-400";
                if (line.includes("SUKCES") || line.includes("ODBLOKOWANO")) color = "text-green-400";
                if (line.includes("AWARIA")) color = "text-orange-500 font-bold";
                if (line.includes("PODSUMOWANIE")) color = "text-yellow-300 font-bold text-sm";
                if (line.startsWith('[T=')) color = "text-blue-300";
                return (
                    <div key={index} className={color}>
                        {line.startsWith('   ') ? <span>&nbsp;&nbsp;&nbsp;{line}</span> : line}
                    </div>
                );
            })}
            <div ref={logEndRef} />
        </div>
    );
};

// === Akordeon (Rozwijana lista) ===
export const AccordionItem = ({ title, id, open, setOpen, children }) => { 
    const isOpen = open === id; 
    return ( 
        <div className="border-b border-gray-200"> 
            <button onClick={() => setOpen(isOpen ? null : id)} className="w-full flex justify-between items-center p-3 text-left font-semibold text-gray-700 hover:bg-gray-50"> 
                <span>{title}</span><span className="text-xl">{isOpen ? '−' : '+'}</span> 
            </button> 
            <div className={`overflow-hidden transition-all duration-300 ease-out ${isOpen ? 'max-h-[1000px]' : 'max-h-0'}`}>
                <div className="p-3 bg-white border-t">{children}</div>
            </div> 
        </div> 
    ); 
};

// === Lista Dwukolumnowa ===
export const DualListBox = ({ title, options, selectedItems, onSelectionChange, renderItem, height = '120px' }) => { 
    const [leftSearch, setLeftSearch] = useState(''); 
    const [rightSearch, setRightSearch] = useState(''); 
    const availableItems = options.filter(opt => !selectedItems.some(sel => sel.id === opt.id)).filter(opt => !leftSearch || (renderItem(opt).toLowerCase().includes(leftSearch.toLowerCase()))); 
    const assignedItems = selectedItems.filter(opt => !rightSearch || (renderItem(opt).toLowerCase().includes(rightSearch.toLowerCase()))); 
    return ( 
        <div className="border border-gray-300 rounded-lg p-2 bg-gray-50"> 
            <p className="text-xs font-bold text-gray-600 mb-2">{title}</p> 
            <div className="flex space-x-2 h-full"> 
                <div className="flex-1 flex flex-col"> 
                    <input type="text" placeholder="Szukaj..." className="text-xs p-1 border mb-1 rounded" value={leftSearch} onChange={e => setLeftSearch(e.target.value)}/> 
                    <div className="flex-1 border bg-white overflow-y-auto rounded p-1" style={{ height: height }}> 
                        {availableItems.map(item => ( 
                            <div key={item.id} onClick={() => onSelectionChange([...selectedItems, item])} className="cursor-pointer hover:bg-blue-100 p-1 text-xs truncate"> + {renderItem(item)} </div> 
                        ))} 
                    </div> 
                </div> 
                <div className="flex-1 flex flex-col"> 
                    <input type="text" placeholder="Szukaj..." className="text-xs p-1 border mb-1 rounded" value={rightSearch} onChange={e => setRightSearch(e.target.value)}/> 
                    <div className="flex-1 border bg-white overflow-y-auto rounded p-1" style={{ height: height }}> 
                        {assignedItems.map(item => ( 
                            <div key={item.id} onClick={() => onSelectionChange(selectedItems.filter(i => i.id !== item.id))} className="cursor-pointer hover:bg-red-100 p-1 text-xs truncate"> - {renderItem(item)} </div> 
                        ))} 
                    </div> 
                </div> 
            </div> 
        </div> 
    ); 
};

// === Input Pliku ===
export const FileInput = ({ label, type, onFileSelected, accept = ".csv" }) => ( 
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input type="file" accept={accept} onChange={(e) => onFileSelected(e.target.files[0], type)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
    </div> 
);

// === Karta Statystyk ===
export const StatCard = ({ title, stats, onExport }) => ( 
    <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <div className="flex justify-between items-start mb-2">
            <h4 className="text-lg font-semibold text-gray-800">{title}</h4>
            {onExport && (
                <button onClick={onExport} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded">
                    💾 Zapisz
                </button>
            )}
        </div>
        <p className="text-sm">Rekordy: <span className="font-bold">{stats.count}</span></p>
        {stats.sizes !== undefined && <p className="text-sm">Rozmiary: <span className="font-bold">{stats.sizes}</span></p>}
    </div> 
);