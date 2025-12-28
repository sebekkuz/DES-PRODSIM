import React from 'react';
import { useApp } from '../context/AppContext';

// --- SUB-KOMPONENTY ---

const WipChart = ({ data }) => {
    if (!data || data.length === 0) return <p>Brak danych WIP</p>;
    const height = 200;
    const width = 600;
    const padding = 20;
    
    const maxVal = Math.max(...data.map(d => d.count)) * 1.1;
    const maxTime = data[data.length - 1].time;
    
    const getX = (time) => padding + (time / maxTime) * (width - 2 * padding);
    const getY = (val) => height - padding - (val / maxVal) * (height - 2 * padding);
    
    let points = "";
    data.forEach((d, i) => { const x = getX(d.time); const y = getY(d.count); points += `${x},${y} `; });

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="bg-white border rounded">
            <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding} stroke="#ddd" />
            <line x1={padding} y1={padding} x2={padding} y2={height-padding} stroke="#ddd" />
            <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="2" />
            <text x={padding} y={height-5} fontSize="10" fill="gray">0h</text>
            <text x={width-30} y={height-5} fontSize="10" fill="gray">{maxTime.toFixed(0)}h</text>
            <text x={5} y={padding} fontSize="10" fill="gray">{maxVal.toFixed(0)}</text>
        </svg>
    );
};

const LeadTimeComposition = ({ breakdown, avgTotal }) => {
    if (!breakdown || avgTotal === 0) return null;
    const processPct = (breakdown.processing / avgTotal) * 100;
    const transportPct = (breakdown.transport / avgTotal) * 100;
    const waitPct = (breakdown.wait / avgTotal) * 100;
    const blockedPct = (breakdown.blocked / avgTotal) * 100;
    return (
        <div className="space-y-2">
            <div className="flex h-8 w-full rounded-lg overflow-hidden shadow-sm text-xs text-white font-bold leading-8 text-center">
                <div style={{ width: `${processPct}%` }} className="bg-green-500">{processPct > 5 && `${processPct.toFixed(0)}%`}</div>
                <div style={{ width: `${transportPct}%` }} className="bg-blue-400">{transportPct > 5 && `${transportPct.toFixed(0)}%`}</div>
                <div style={{ width: `${waitPct}%` }} className="bg-yellow-400 text-gray-800">{waitPct > 5 && `${waitPct.toFixed(0)}%`}</div>
                <div style={{ width: `${blockedPct}%` }} className="bg-red-500">{blockedPct > 5 && `${blockedPct.toFixed(0)}%`}</div>
            </div>
            <div className="flex justify-between text-xs text-gray-600 px-1">
                <div className="flex items-center"><span className="w-3 h-3 bg-green-500 rounded-sm mr-1"></span> Proces ({breakdown.processing.toFixed(1)}h)</div>
                <div className="flex items-center"><span className="w-3 h-3 bg-blue-400 rounded-sm mr-1"></span> Transp. ({breakdown.transport.toFixed(1)}h)</div>
                <div className="flex items-center"><span className="w-3 h-3 bg-yellow-400 rounded-sm mr-1"></span> Kolejka ({breakdown.wait.toFixed(1)}h)</div>
                <div className="flex items-center"><span className="w-3 h-3 bg-red-500 rounded-sm mr-1"></span> Blokady ({breakdown.blocked.toFixed(1)}h)</div>
            </div>
        </div>
    );
};

// --- GŁÓWNY MODUŁ WYNIKÓW ---

export default function ModuleResults() {
    const { simulationResults } = useApp();

    if (!simulationResults) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                    <h3 className="text-xl font-semibold">Brak wyników symulacji</h3>
                    <p>Przejdź do zakładki "Symulacja" i uruchom proces.</p>
                </div>
            </div>
        );
    }

    const { 
        avgFlowEfficiency, avgLeadTime, produced, actualTakt, targetTakt,
        stationStats, bufferStats, wipHistory, workerStats, leadTimeBreakdown,
        orderReports, productReports, otif, cpu, avgWipValue,
        totalLaborCost, totalEnergyCost, scrapped, dynamicBottlenecks
    } = simulationResults;

    const actualTaktMin = (actualTakt * 60).toFixed(2);
    const targetTaktMin = targetTakt > 0 ? (targetTakt * 60).toFixed(2) : "-";
    const taktDiff = targetTakt > 0 ? (actualTakt * 60) - (targetTakt * 60) : 0;
    const taktStatusColor = taktDiff > 0 ? "text-red-600" : "text-green-600";

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-10">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                    <h4 className="text-xs text-gray-500 uppercase font-bold">Supply Chain (OTIF)</h4>
                    <div className="flex items-end justify-between"><p className="text-3xl font-bold text-gray-800">{otif}%</p><span className={otif < 90 ? "text-red-500 text-xs" : "text-green-500 text-xs"}>{otif < 90 ? "Poniżej celu" : "Dobry wynik"}</span></div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
                    <h4 className="text-xs text-gray-500 uppercase font-bold">Finanse (CPU)</h4>
                    <p className="text-3xl font-bold text-gray-800">{cpu} zł</p>
                </div>
                 <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
                    <h4 className="text-xs text-gray-500 uppercase font-bold">Jakość (Scrap)</h4>
                    <div className="flex items-end justify-between"><p className="text-3xl font-bold text-gray-800">{scrapped} szt.</p><p className="text-lg text-gray-400">/ {produced + scrapped}</p></div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                    <h4 className="text-xs text-gray-500 uppercase font-bold">Flow Efficiency</h4>
                    <p className="text-3xl font-bold text-gray-800">{avgFlowEfficiency ? avgFlowEfficiency.toFixed(1) : 0}%</p>
                    <p className="text-xs text-gray-400 mt-1">Lead Time: {avgLeadTime ? avgLeadTime.toFixed(1) : 0}h</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <h3 className="font-semibold text-gray-700 mb-2">Struktura Kosztów</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>Robocizna:</span> <span className="font-bold">{totalLaborCost ? totalLaborCost.toFixed(2) : 0} zł</span></div>
                        <div className="flex justify-between"><span>Energia:</span> <span className="font-bold">{totalEnergyCost ? totalEnergyCost.toFixed(2) : 0} zł</span></div>
                        <div className="flex justify-between text-blue-600"><span>Śr. Wartość WIP:</span> <span className="font-bold">{avgWipValue} zł</span></div>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow flex flex-col justify-between">
                    <div><h3 className="font-semibold text-gray-700 mb-2">Analiza Taktu</h3></div>
                    <div className="flex justify-between items-end mt-4">
                        <div><p className="text-xs text-gray-400">Cel (min)</p><p className="text-xl font-bold text-gray-600">{targetTaktMin}</p></div>
                        <div className="text-right"><p className="text-xs text-gray-400">Rzeczywisty (min)</p><p className={`text-2xl font-bold ${taktStatusColor}`}>{actualTaktMin}</p></div>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <h3 className="font-semibold text-gray-700 mb-2">Dynamiczne Wąskie Gardła</h3>
                    <div className="space-y-2 text-xs">
                        {dynamicBottlenecks && dynamicBottlenecks.slice(0, 3).map((db, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-red-50 p-2 rounded border border-red-100"><span className="font-bold">{idx+1}. {db.name}</span><span className="text-red-600">{db.hours}h obc. max</span></div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-semibold text-gray-800 mb-3">Składowe Lead Time</h3>
                <LeadTimeComposition breakdown={leadTimeBreakdown} avgTotal={avgLeadTime} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="p-4 border-b bg-gray-50"><h3 className="font-semibold text-gray-800">Analiza Stacji</h3></div>
                    <div className="overflow-x-auto max-h-80"><table className="w-full text-sm text-left"><thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0"><tr><th className="p-3">Stacja</th><th className="p-3">Utylizacja</th><th className="p-3 text-red-600">Awarie</th></tr></thead><tbody>{stationStats.map(s => (<tr key={s.id} className="border-b hover:bg-gray-50"><td className="p-3 font-medium">{s.name}</td><td className="p-3">{s.utilization}%</td><td className="p-3 text-red-600 font-bold">{s.failures}</td></tr>))}</tbody></table></div>
                </div>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="p-4 border-b bg-gray-50"><h3 className="font-semibold text-gray-800">Analiza Zasobów</h3></div>
                    <div className="overflow-x-auto max-h-80"><table className="w-full text-sm text-left"><thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0"><tr><th className="p-3">Zasób</th><th className="p-3">Ilość</th><th className="p-3">Utylizacja</th><th className="p-3">Koszt</th></tr></thead><tbody>{workerStats && workerStats.map(w => (<tr key={w.id} className="border-b hover:bg-gray-50"><td className="p-3 font-medium">{w.id}</td><td className="p-3">{w.capacity}</td><td className="p-3 font-bold text-blue-600">{w.utilization}%</td><td className="p-3 text-gray-600">{w.attendanceCost} zł</td></tr>))}</tbody></table></div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow p-4 flex flex-col">
                    <h3 className="font-semibold text-gray-800 mb-4">Historia WIP</h3>
                    <div className="flex-1 bg-gray-50 rounded flex items-center justify-center p-2"><WipChart data={wipHistory} /></div>
                </div>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                     <div className="p-4 border-b bg-gray-50"><h3 className="font-semibold text-gray-800">Analiza Buforów</h3></div>
                     <div className="overflow-x-auto max-h-80">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0"><tr><th className="p-3">Bufor</th><th className="p-3">Max</th><th className="p-3">%</th><th className="p-3">Status</th></tr></thead>
                            <tbody>{bufferStats.map(b => (<tr key={b.id} className="border-b hover:bg-gray-50"><td className="p-3 font-medium">{b.name}</td><td className="p-3">{b.maxQueue} / {b.capacity}</td><td className="p-3">{b.utilization}%</td><td className={`p-3 ${parseFloat(b.utilization) > 80 ? "text-red-600 font-bold" : "text-green-600"}`}>{parseFloat(b.utilization) > 90 ? "PRZEPEŁNIENIE" : "OK"}</td></tr>))}</tbody>
                        </table>
                     </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-semibold text-gray-800 mb-4 border-b pb-2">Raport Produkcji</h3>
                <h4 className="text-sm font-bold text-gray-600 mb-2">1. Szczegółowa Realizacja Zleceń</h4>
                <div className="overflow-x-auto mb-6 border rounded">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 text-gray-600 uppercase text-xs"><tr><th className="p-2">ID</th><th className="p-2">Status</th><th className="p-2">Terminowość</th><th className="p-2">Czas (h)</th></tr></thead>
                        <tbody>{orderReports && orderReports.map(o => (<tr key={o.id} className="border-b hover:bg-gray-50"><td className="p-2 font-medium">{o.id}</td><td className="p-2"><span className={`px-2 py-1 rounded text-xs font-bold ${o.status === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{o.status}</span></td><td className="p-2">{o.onTime ? '✅' : '❌'}</td><td className="p-2">{o.duration}</td></tr>))}</tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};