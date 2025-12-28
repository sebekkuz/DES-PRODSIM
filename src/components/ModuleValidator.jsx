import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function ModuleValidator() {
    const { simulationConfig, db, mrp } = useApp();
    const [issues, setIssues] = useState([]);

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

    return (
        <div className="max-w-6xl mx-auto pb-10">
            <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center">
                        <span className="mr-2 text-2xl">🕵️‍♀️</span> Audyt Procesu
                    </h3>
                    <button onClick={runValidationAnalysis} className="bg-blue-100 text-blue-700 px-4 py-2 rounded hover:bg-blue-200 font-semibold text-sm">Odśwież Analizę</button>
                </div>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className={`p-4 rounded border-l-4 ${errorCount > 0 ? 'bg-red-50 border-red-500' : 'bg-green-50 border-green-500'}`}>
                        <h4 className="font-bold text-gray-700">Błędy Krytyczne</h4>
                        <p className="text-2xl font-bold">{errorCount}</p>
                    </div>
                    <div className={`p-4 rounded border-l-4 ${warningCount > 0 ? 'bg-yellow-50 border-yellow-500' : 'bg-gray-50 border-gray-400'}`}>
                        <h4 className="font-bold text-gray-700">Ostrzeżenia</h4>
                        <p className="text-2xl font-bold">{warningCount}</p>
                    </div>
                    <div className="p-4 rounded border-l-4 bg-blue-50 border-blue-500">
                        <h4 className="font-bold text-gray-700">Sugestie</h4>
                        <p className="text-2xl font-bold">{issues.filter(i => i.type === 'info').length}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    {issues.length === 0 && (
                        <div className="text-center p-8 text-green-600 bg-green-50 rounded border border-green-200">
                            <h4 className="font-bold text-lg">Wszystko wygląda dobrze!</h4>
                            <p>Nie wykryto oczywistych anomalii w konfiguracji.</p>
                        </div>
                    )}
                    {issues.map((issue, idx) => (
                        <div key={idx} className={`p-3 rounded border flex items-start ${
                            issue.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                            issue.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                            'bg-blue-50 border-blue-200 text-blue-800'
                        }`}>
                            <div className="mr-3 text-xl">
                                {issue.type === 'error' ? '🛑' : issue.type === 'warning' ? '⚠️' : 'ℹ️'}
                            </div>
                            <div>
                                <span className="font-bold text-xs uppercase tracking-wide opacity-70 block mb-1">{issue.category}</span>
                                <p className="text-sm font-medium">{issue.message}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};