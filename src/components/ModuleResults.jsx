import React from 'react';
import { useApp } from '../context/AppContext';
import { 
    BarChart3, 
    TrendingUp, 
    AlertOctagon, 
    Clock, 
    DollarSign, 
    Activity, 
    PackageCheck,
    Zap,
    CheckCircle2,
    XCircle,
    Users,       // Ikona dla zasobów
    Layers,      // Ikona dla buforów
    Factory      // Ikona dla stacji
} from 'lucide-react';

// --- SUB-KOMPONENTY ---

const WipChart = ({ data }) => {
    if (!data || data.length === 0) return <div className="flex items-center justify-center h-full text-xs text-slate-400">Brak danych WIP</div>;
    const height = 180;
    // Ustawiamy sztywną szerokość viewBox, ale CSS width: 100% skaluje to
    const width = 500; 
    const padding = 20;
    
    const maxVal = Math.max(...data.map(d => d.count)) * 1.1 || 10; // Fallback to 10 if max is 0
    const maxTime = data[data.length - 1].time || 100;
    
    const getX = (time) => padding + (time / maxTime) * (width - 2 * padding);
    const getY = (val) => height - padding - (val / maxVal) * (height - 2 * padding);
    
    let points = "";
    data.forEach((d) => { const x = getX(d.time); const y = getY(d.count); points += `${x},${y} `; });

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible" preserveAspectRatio="none">
            {/* Osie */}
            <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding} stroke="#e2e8f0" strokeWidth="1" />
            <line x1={padding} y1={padding} x2={padding} y2={height-padding} stroke="#e2e8f0" strokeWidth="1" />
            
            {/* Wykres */}
            <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            
            {/* Etykiety */}
            <text x={padding} y={height+15} fontSize="10" fill="#94a3b8">0h</text>
            <text x={width-30} y={height+15} fontSize="10" fill="#94a3b8">{maxTime.toFixed(0)}h</text>
            <text x={0} y={padding} fontSize="10" fill="#94a3b8">{maxVal.toFixed(0)}</text>
        </svg>
    );
};

const LeadTimeComposition = ({ breakdown, avgTotal }) => {
    if (!breakdown || avgTotal === 0) return <div className="text-xs text-slate-400">Brak danych Lead Time</div>;
    const processPct = (breakdown.processing / avgTotal) * 100;
    const transportPct = (breakdown.transport / avgTotal) * 100;
    const waitPct = (breakdown.wait / avgTotal) * 100;
    const blockedPct = (breakdown.blocked / avgTotal) * 100;
    
    return (
        <div className="space-y-3">
            <div className="flex h-6 w-full rounded-full overflow-hidden shadow-sm text-[10px] text-white font-bold leading-6 text-center">
                <div style={{ width: `${processPct}%` }} className="bg-emerald-500" title={`Proces: ${processPct.toFixed(1)}%`}>{processPct > 8 && `${processPct.toFixed(0)}%`}</div>
                <div style={{ width: `${transportPct}%` }} className="bg-blue-400" title={`Transport: ${transportPct.toFixed(1)}%`}>{transportPct > 8 && `${transportPct.toFixed(0)}%`}</div>
                <div style={{ width: `${waitPct}%` }} className="bg-amber-400 text-amber-900" title={`Kolejka: ${waitPct.toFixed(1)}%`}>{waitPct > 8 && `${waitPct.toFixed(0)}%`}</div>
                <div style={{ width: `${blockedPct}%` }} className="bg-red-500" title={`Blokada: ${blockedPct.toFixed(1)}%`}>{blockedPct > 8 && `${blockedPct.toFixed(0)}%`}</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span> Proces ({breakdown.processing.toFixed(1)}h)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-400 rounded-full"></span> Transp. ({breakdown.transport.toFixed(1)}h)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-amber-400 rounded-full"></span> Kolejka ({breakdown.wait.toFixed(1)}h)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-500 rounded-full"></span> Blokady ({breakdown.blocked.toFixed(1)}h)</div>
            </div>
        </div>
    );
};

// --- GŁÓWNY MODUŁ WYNIKÓW ---

export default function ModuleResults() {
    const { simulationResults } = useApp();

    if (!simulationResults) {
        return (
            <div className="flex h-[82vh] items-center justify-center bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-center p-8">
                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <BarChart3 size={32}/>
                    </div>
                    <h3 className="text-lg font-bold text-slate-700">Brak wyników symulacji</h3>
                    <p className="text-sm text-slate-500 mt-2">Przejdź do zakładki "Symulacja" i uruchom proces.</p>
                </div>
            </div>
        );
    }

    const { 
        avgFlowEfficiency, avgLeadTime, produced, actualTakt, targetTakt,
        stationStats, bufferStats, wipHistory, workerStats, leadTimeBreakdown,
        orderReports, otif, cpu, avgWipValue,
        totalLaborCost, totalEnergyCost, scrapped, dynamicBottlenecks
    } = simulationResults;

    const actualTaktMin = (actualTakt * 60).toFixed(2);
    const targetTaktMin = targetTakt > 0 ? (targetTakt * 60).toFixed(2) : "-";
    const taktDiff = targetTakt > 0 ? (actualTakt * 60) - (targetTakt * 60) : 0;
    const taktStatusColor = taktDiff > 0 ? "text-red-600" : "text-emerald-600";

    return (
        <div className="flex h-[82vh] gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-card font-sans text-slate-900 overflow-hidden">
            
            {/* PANEL BOCZNY - SCORECARD */}
            <aside className="w-72 flex flex-col gap-4 overflow-y-auto custom-scrollbar shrink-0">
                
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-1">
                        <Activity size={16} className="text-blue-600"/> Wyniki Symulacji
                    </h2>
                    <p className="text-xs text-slate-500">Kluczowe wskaźniki (KPI)</p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><PackageCheck size={12}/> OTIF (Supply Chain)</h4>
                    <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-bold text-slate-800">{otif}%</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${otif < 90 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                            {otif < 90 ? "NISKI" : "DOBRY"}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-purple-500">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><DollarSign size={12}/> CPU (Koszt jedn.)</h4>
                    <span className="text-3xl font-bold text-slate-800">{cpu} <span className="text-sm text-slate-400 font-normal">zł</span></span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><AlertOctagon size={12}/> Jakość (Scrap)</h4>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-slate-800">{scrapped}</span>
                        <span className="text-xs text-slate-400">szt. wadliwych</span>
                    </div>
                    <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full" style={{width: `${(scrapped / (produced + scrapped)) * 100}%`}}></div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Zap size={12}/> Flow Efficiency</h4>
                    <span className="text-3xl font-bold text-slate-800">{avgFlowEfficiency ? avgFlowEfficiency.toFixed(1) : 0}%</span>
                    <p className="text-xs text-slate-400 mt-1">Lead Time: <span className="font-semibold text-slate-600">{avgLeadTime ? avgLeadTime.toFixed(1) : 0}h</span></p>
                </div>

                <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-600 uppercase mb-3">Struktura Kosztów</h4>
                    <div className="space-y-2 text-xs">
                         <div className="flex justify-between"><span>Robocizna:</span> <span className="font-bold">{totalLaborCost ? totalLaborCost.toFixed(0) : 0} zł</span></div>
                         <div className="flex justify-between"><span>Energia:</span> <span className="font-bold">{totalEnergyCost ? totalEnergyCost.toFixed(0) : 0} zł</span></div>
                         <div className="h-px bg-slate-200 my-1"></div>
                         <div className="flex justify-between text-blue-600"><span>WIP (Śr.):</span> <span className="font-bold">{avgWipValue} zł</span></div>
                    </div>
                </div>

            </aside>

            {/* OBSZAR GŁÓWNY */}
            <main className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2 pb-4">
                
                {/* RZĄD 1: TAKT & WĄSKIE GARDŁA */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {/* Analiza Taktu */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Clock size={16}/> Analiza Taktu</h3>
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg">
                             <div className="text-center">
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cel (Target)</p>
                                <p className="text-2xl font-bold text-slate-600">{targetTaktMin} <span className="text-xs font-normal">min</span></p>
                             </div>
                             <div className="h-10 w-px bg-slate-200"></div>
                             <div className="text-center">
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Rzeczywisty</p>
                                <p className={`text-3xl font-bold ${taktStatusColor}`}>{actualTaktMin} <span className="text-xs font-normal text-slate-400">min</span></p>
                             </div>
                        </div>
                    </div>

                    {/* Dynamiczne Wąskie Gardła (PRZYWRÓCONE) */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                         <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp size={16}/> Dynamiczne Wąskie Gardła</h3>
                         <div className="space-y-2">
                            {dynamicBottlenecks && dynamicBottlenecks.slice(0, 3).map((db, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-red-50 px-3 py-2.5 rounded-lg border border-red-100">
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs font-bold">{idx+1}</span>
                                        <span className="text-xs font-bold text-slate-700">{db.name}</span>
                                    </div>
                                    <span className="text-xs font-bold text-red-600">{db.hours}h <span className="font-normal opacity-70">obciążenia</span></span>
                                </div>
                            ))}
                            {(!dynamicBottlenecks || dynamicBottlenecks.length === 0) && (
                                <div className="text-center py-4 text-xs text-slate-400 italic">Brak wyraźnych wąskich gardeł w procesie.</div>
                            )}
                         </div>
                    </div>
                </div>

                {/* RZĄD 2: HISTORIA WIP & LEAD TIME */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                     {/* Historia WIP (PRZYWRÓCONE) */}
                     <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-64">
                        <h3 className="text-sm font-bold text-slate-700 mb-4">Historia WIP (Work In Progress)</h3>
                        <div className="flex-1 w-full min-h-0 relative">
                            {/* Umieszczamy wykres w kontenerze absolutnym, aby się nie rozpychał */}
                            <div className="absolute inset-0">
                                <WipChart data={wipHistory} />
                            </div>
                        </div>
                    </div>

                    {/* Składowe Lead Time */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm h-64 flex flex-col justify-center">
                        <h3 className="text-sm font-bold text-slate-700 mb-6">Składowe Czasu Przejścia (Lead Time)</h3>
                        <LeadTimeComposition breakdown={leadTimeBreakdown} avgTotal={avgLeadTime} />
                    </div>
                </div>

                {/* RZĄD 3: ANALIZA STACJI I ZASOBÓW (PRZYWRÓCONE) */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {/* Analiza Stacji */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-72 flex flex-col">
                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <Factory size={16} className="text-slate-400"/>
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Analiza Stacji</h3>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-white text-slate-500 sticky top-0 shadow-sm z-10">
                                    <tr><th className="p-3 font-semibold">Stacja</th><th className="p-3 font-semibold">Utylizacja</th><th className="p-3 font-semibold text-red-600">Awarie</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {stationStats.map(s => (
                                        <tr key={s.id} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-700">{s.name}</td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500" style={{width: `${s.utilization}%`}}></div>
                                                    </div>
                                                    {s.utilization}%
                                                </div>
                                            </td>
                                            <td className="p-3 text-red-600 font-bold">{s.failures}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Analiza Zasobów (PRZYWRÓCONE) */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-72 flex flex-col">
                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <Users size={16} className="text-slate-400"/>
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Analiza Zasobów</h3>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-white text-slate-500 sticky top-0 shadow-sm z-10">
                                    <tr>
                                        <th className="p-3 font-semibold">Zasób</th>
                                        <th className="p-3 font-semibold text-center">Ilość</th>
                                        <th className="p-3 font-semibold">Utylizacja</th>
                                        <th className="p-3 font-semibold text-right">Koszt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {workerStats && workerStats.map(w => (
                                        <tr key={w.id} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-700">{w.id}</td>
                                            <td className="p-3 text-center">{w.capacity}</td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                     <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500" style={{width: `${w.utilization}%`}}></div>
                                                    </div>
                                                    <span className="font-bold text-indigo-600">{w.utilization}%</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right text-slate-600">{w.attendanceCost} zł</td>
                                        </tr>
                                    ))}
                                    {(!workerStats || workerStats.length === 0) && (
                                        <tr><td colSpan="4" className="p-4 text-center text-slate-400 italic">Brak danych o zasobach</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* RZĄD 4: BUFORY I ZLECENIA (PRZYWRÓCONE) */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                     {/* Analiza Buforów (PRZYWRÓCONE) */}
                     <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-72 flex flex-col">
                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <Layers size={16} className="text-slate-400"/>
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Analiza Buforów</h3>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-white text-slate-500 sticky top-0 shadow-sm z-10">
                                    <tr>
                                        <th className="p-3 font-semibold">Bufor</th>
                                        <th className="p-3 font-semibold">Zapełnienie</th>
                                        <th className="p-3 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {bufferStats.map(b => (
                                        <tr key={b.id} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-700">{b.name}</td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    <span>{b.maxQueue} / {b.capacity}</span>
                                                    <span className="text-[10px] text-slate-400">({b.utilization}%)</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                {parseFloat(b.utilization) > 90 ? (
                                                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">PRZEPEŁNIENIE</span>
                                                ) : parseFloat(b.utilization) > 50 ? (
                                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px]">OBCIĄŻONY</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">OK</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Raport Zleceń */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-72 flex flex-col">
                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <PackageCheck size={16} className="text-slate-400"/>
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Raport Zleceń</h3>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-white text-slate-500 sticky top-0 shadow-sm z-10">
                                    <tr>
                                        <th className="p-3 font-semibold">ID</th>
                                        <th className="p-3 font-semibold">Status</th>
                                        <th className="p-3 font-semibold">Termin</th>
                                        <th className="p-3 font-semibold text-right">Czas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {orderReports && orderReports.map(o => (
                                        <tr key={o.id} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-700">{o.id}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded-md font-bold text-[10px] uppercase ${o.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {o.status}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                {o.onTime ? 
                                                    <CheckCircle2 size={16} className="text-emerald-500"/> : 
                                                    <XCircle size={16} className="text-red-500"/>
                                                }
                                            </td>
                                            <td className="p-3 font-mono text-slate-600 text-right">{o.duration}h</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
};