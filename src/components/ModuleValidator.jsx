import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
    ShieldCheck, 
    RefreshCw, 
    AlertTriangle, 
    XCircle, 
    Info, 
    CheckCircle2, 
    Filter 
} from 'lucide-react';

export default function ModuleValidator() {
    const { simulationConfig, db, mrp } = useApp();
    const [issues, setIssues] = useState([]);
    const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'error', 'warning', 'info'

    const runValidationAnalysis = () => {
        const newIssues = [];
        const addIssue = (type, category, message) => newIssues.push({ type, category, message });

        const allNodes = [...simulationConfig.stations, ...simulationConfig.buffers];
        const flows = simulationConfig.flows;
        
        allNodes.forEach(node => {
            const hasInput = flows.some(f => f.to === node.id);
            const hasOutput = flows.some(f => f.from === node.id);
            const isStart = node.isStartBuffer;
            const isEnd = node.isEndBuffer;

            if (!isStart && !hasInput) {
                addIssue('error', 'Sierota (Wejście)', `Węzeł "${node.name}" nie ma wejścia. Nic do niego nie trafi.`);
            }
            if (!isEnd && !hasOutput) {
                addIssue('error', 'Sierota (Wyjście)', `Węzeł "${node.name}" nie ma wyjścia. Produkty utkną.`);
            }
        });

        simulationConfig.stations.forEach(station => {
            const workerFlow = simulationConfig.workerFlows.find(wf => wf.to === station.id);
            if (!workerFlow) {
                addIssue('warning', 'Brak Pracownika', `Stacja "${station.name}" nie ma przypisanego pracownika. Operacje mogą nie ruszyć.`);
            } else {
                const pool = simulationConfig.workerPools.find(p => p.id === workerFlow.from);
                if (pool && pool.capacity === 0) {
                    addIssue('error', 'Zasoby', `Pula pracowników "${pool.name}" ma pojemność 0.`);
                }
            }
        });

        if (mrp.length > 0) {
            const activeProducts = new Set();
            mrp.forEach(order => {
                const parts = order['Sekcje'] ? order['Sekcje'].split('-') : [];
                parts.forEach(partStr => {
                    if(partStr.startsWith('M')) { 
                        activeProducts.add({ type: 'casings', code: partStr, size: order['Rozmiar'] });
                    }
                });
            });

            activeProducts.forEach(prod => {
                const routingKey = `${prod.type}_${prod.size}_${prod.code}_phase0`; 
                if (!simulationConfig.routings[routingKey] || simulationConfig.routings[routingKey].length === 0) {
                    addIssue('warning', 'Brak Marszruty', `Produkt ${prod.code} (${prod.size}) występuje w MRP, ale nie ma zdefiniowanej marszruty (Faza 0).`);
                }
            });
        } else {
            addIssue('info', 'MRP', 'Brak wczytanego planu produkcji (MRP).');
        }

        flows.forEach(flow => {
            const fromExists = allNodes.some(n => n.id === flow.from);
            const toExists = allNodes.some(n => n.id === flow.to);
            if (!fromExists || !toExists) {
                addIssue('error', 'Uszkodzony Flow', `Połączenie od "${flow.from}" do "${flow.to}" jest nieprawidłowe (węzeł nie istnieje).`);
            }
        });

        setIssues(newIssues);
    };

    useEffect(() => {
        runValidationAnalysis();
    }, [simulationConfig, db, mrp]);

    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const infoCount = issues.filter(i => i.type === 'info').length;

    const filteredIssues = issues.filter(i => activeFilter === 'all' || i.type === activeFilter);

    return (
        <div className="flex h-[82vh] gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-card font-sans text-slate-900 overflow-hidden">
            
            {/* PANEL BOCZNY - PODSUMOWANIE */}
            <aside className="w-80 flex flex-col gap-4 bg-white rounded-xl shadow-sm border border-slate-200 p-5 shrink-0">
                <div className="pb-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck size={16} className="text-blue-600"/> Audyt Procesu
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Status poprawności konfiguracji</p>
                </div>

                <div className="space-y-3">
                    <button 
                        onClick={() => setActiveFilter('all')}
                        className={`w-full p-3 rounded-xl border transition-all flex items-center justify-between group ${activeFilter === 'all' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                    >
                        <span className="text-xs font-bold uppercase">Wszystkie</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${activeFilter === 'all' ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{issues.length}</span>
                    </button>

                    <button 
                        onClick={() => setActiveFilter('error')}
                        className={`w-full p-3 rounded-xl border transition-all flex items-center justify-between group ${activeFilter === 'error' ? 'bg-red-50 border-red-200 shadow-sm ring-1 ring-red-200' : 'bg-white border-slate-200 hover:border-red-200'}`}
                    >
                        <div className="flex items-center gap-2">
                            <XCircle size={16} className="text-red-500"/>
                            <span className={`text-xs font-bold uppercase ${activeFilter === 'error' ? 'text-red-700' : 'text-slate-600'}`}>Błędy</span>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${activeFilter === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{errorCount}</span>
                    </button>

                    <button 
                        onClick={() => setActiveFilter('warning')}
                        className={`w-full p-3 rounded-xl border transition-all flex items-center justify-between group ${activeFilter === 'warning' ? 'bg-amber-50 border-amber-200 shadow-sm ring-1 ring-amber-200' : 'bg-white border-slate-200 hover:border-amber-200'}`}
                    >
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-500"/>
                            <span className={`text-xs font-bold uppercase ${activeFilter === 'warning' ? 'text-amber-700' : 'text-slate-600'}`}>Ostrzeżenia</span>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${activeFilter === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{warningCount}</span>
                    </button>

                    <button 
                        onClick={() => setActiveFilter('info')}
                        className={`w-full p-3 rounded-xl border transition-all flex items-center justify-between group ${activeFilter === 'info' ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-200' : 'bg-white border-slate-200 hover:border-blue-200'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Info size={16} className="text-blue-500"/>
                            <span className={`text-xs font-bold uppercase ${activeFilter === 'info' ? 'text-blue-700' : 'text-slate-600'}`}>Sugestie</span>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${activeFilter === 'info' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{infoCount}</span>
                    </button>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100">
                    <button 
                        onClick={runValidationAnalysis} 
                        className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-sm font-bold border border-slate-200 transition-all"
                    >
                        <RefreshCw size={16}/> Odśwież Analizę
                    </button>
                </div>
            </aside>

            {/* OBSZAR GŁÓWNY - LISTA */}
            <main className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-white flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Filter size={16} className="text-slate-400"/> Lista Zgłoszeń
                    </h3>
                    <span className="text-xs text-slate-400 italic">
                        Wyświetlanie: {activeFilter === 'all' ? 'Wszystkie' : activeFilter}
                    </span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/30">
                    {filteredIssues.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                            <CheckCircle2 size={48} className="text-emerald-500 opacity-50"/>
                            <div className="text-center">
                                <h4 className="font-bold text-slate-600">Brak zgłoszeń w tej kategorii</h4>
                                <p className="text-xs">Wygląda na to, że wszystko jest w porządku.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredIssues.map((issue, idx) => (
                                <div key={idx} className={`p-4 rounded-xl border flex items-start gap-4 shadow-sm transition-all hover:shadow-md ${
                                    issue.type === 'error' ? 'bg-white border-red-200' :
                                    issue.type === 'warning' ? 'bg-white border-amber-200' :
                                    'bg-white border-blue-200'
                                }`}>
                                    <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${
                                        issue.type === 'error' ? 'bg-red-50 text-red-500' :
                                        issue.type === 'warning' ? 'bg-amber-50 text-amber-500' :
                                        'bg-blue-50 text-blue-500'
                                    }`}>
                                        {issue.type === 'error' ? <XCircle size={20}/> : issue.type === 'warning' ? <AlertTriangle size={20}/> : <Info size={20}/>}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                                issue.type === 'error' ? 'bg-red-100 text-red-700' :
                                                issue.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                                {issue.category}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium text-slate-700 leading-relaxed">{issue.message}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};