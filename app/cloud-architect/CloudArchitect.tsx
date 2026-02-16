'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Play, Trash2, HelpCircle, ChevronRight, Layout, Info, AlertTriangle, Repeat, BookOpen, X, GripVertical, Lightbulb, Edit3, Settings2, CheckCircle2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AWSServiceType, Node, Connection, Scenario, SimulationResult } from './types';
import { SERVICE_METADATA, SCENARIOS, ConfigField } from './constants';
import { evaluateSystemDesign } from './services/geminiService';

export default function CloudArchitect() {
  const [currentScenario, setCurrentScenario] = useState<Scenario>(SCENARIOS[0]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedTool, setSelectedTool] = useState<AWSServiceType | null>(null);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showScenarioPicker, setShowScenarioPicker] = useState(true);
  const [showScenarioDetails, setShowScenarioDetails] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Dragging State
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasMovedDuringClick, setHasMovedDuringClick] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  const totalCost = nodes.reduce((acc, node) => acc + SERVICE_METADATA[node.type].cost, 0);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelectedNodeId(null);
    }

    if (!selectedTool || !canvasRef.current || draggingNodeId) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Initialize with default config from metadata
    const defaultConfig: Record<string, string | boolean> = {};
    SERVICE_METADATA[selectedTool].availableConfigs.forEach(conf => {
      defaultConfig[conf.key] = conf.default;
    });

    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: selectedTool,
      x,
      y,
      label: selectedTool,
      config: defaultConfig
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedTool(null);
  };

  const handleNodeMouseDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === id);
    if (node) {
      setDraggingNodeId(id);
      setSelectedNodeId(id);
      setDragOffset({
        x: e.clientX - node.x,
        y: e.clientY - node.y
      });
      setHasMovedDuringClick(false);
    }
  };

  const handleNodeClickAction = useCallback((id: string) => {
    setConnectionStart(prev => {
      if (prev) {
        if (prev !== id) {
          setConnections(conns => {
            const exists = conns.some(c => c.from === prev && c.to === id);
            if (exists) return conns;
            return [...conns, { from: prev, to: id }];
          });
        }
        return null;
      } else {
        return id;
      }
    });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingNodeId && canvasRef.current) {
      setHasMovedDuringClick(true);
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      setNodes(prev => prev.map(n => 
        n.id === draggingNodeId 
          ? { ...n, x: newX, y: newY } 
          : n
      ));
    }
  }, [draggingNodeId, dragOffset]);

  const handleMouseUp = useCallback(() => {
    if (draggingNodeId) {
      if (!hasMovedDuringClick) {
        handleNodeClickAction(draggingNodeId);
      }
      setDraggingNodeId(null);
    }
  }, [draggingNodeId, hasMovedDuringClick, handleNodeClickAction]);

  useEffect(() => {
    if (draggingNodeId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingNodeId, handleMouseMove, handleMouseUp]);

  const updateNodeLabel = (id: string, newLabel: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, label: newLabel } : n));
  };

  const updateNodeConfig = (id: string, key: string, value: string | boolean) => {
    setNodes(prev => prev.map(n => 
      n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n
    ));
  };

  const removeNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const startSimulation = async () => {
    if (nodes.length === 0) return;
    setIsSimulating(true);
    setSimulationResult(null);
    const result = await evaluateSystemDesign(currentScenario, nodes, connections);
    setSimulationResult(result);
    setIsSimulating(false);
  };

  const resetGame = () => {
    setNodes([]);
    setConnections([]);
    setSimulationResult(null);
    setSelectedNodeId(null);
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden text-slate-100">
      {/* Sidebar: Service Palette & Inspector */}
      <aside className="w-80 bg-slate-800/50 border-r border-slate-700 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold flex items-center gap-2 text-orange-500">
            <Layout className="w-6 h-6" /> Cloud Architect
          </h1>
          <p className="text-xs text-slate-400 mt-1">Design for Scale, Architect for Cloud</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {selectedNode ? (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="p-4 bg-slate-900/50 rounded-xl border border-orange-500/30">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Inspector</span>
                  <button onClick={() => setSelectedNodeId(null)} className="text-slate-500 hover:text-white transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`${SERVICE_METADATA[selectedNode.type].color} p-2 rounded text-white shadow-lg`}>
                    {SERVICE_METADATA[selectedNode.type].icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold leading-none">{selectedNode.type}</h3>
                    <span className="text-[10px] text-slate-500">Node ID: {selectedNode.id.split('-')[1]}</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Custom Label</span>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={selectedNode.label}
                        onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-all pl-8"
                        placeholder="e.g. Production DB"
                      />
                      <Edit3 size={14} className="absolute left-2.5 top-2.5 text-slate-600" />
                    </div>
                  </label>
                </div>
              </div>

              {/* Configuration Section */}
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Settings2 size={12} /> Service Configuration
                </h4>
                <div className="space-y-4">
                  {SERVICE_METADATA[selectedNode.type].availableConfigs.map((field: ConfigField) => (
                    <div key={field.key} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-300">{field.label}</span>
                        {field.type === 'toggle' && (
                          <button
                            onClick={() => updateNodeConfig(selectedNode.id, field.key, !selectedNode.config[field.key])}
                            className={`w-10 h-5 rounded-full transition-all relative ${selectedNode.config[field.key] ? 'bg-orange-600' : 'bg-slate-700'}`}
                          >
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${selectedNode.config[field.key] ? 'left-6' : 'left-1'}`} />
                          </button>
                        )}
                      </div>
                      {field.type === 'select' && (
                        <select
                          value={selectedNode.config[field.key]}
                          onChange={(e) => updateNodeConfig(selectedNode.id, field.key, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500"
                        >
                          {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                  {SERVICE_METADATA[selectedNode.type].availableConfigs.length === 0 && (
                    <p className="text-[10px] text-slate-500 italic">No advanced options for this service.</p>
                  )}
                </div>
              </div>

              <button 
                onClick={() => removeNode(selectedNode.id)}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded border border-red-500/30 transition-all"
              >
                <Trash2 size={12} /> Remove Component
              </button>
            </div>
          ) : (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">AWS Palette</div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(SERVICE_METADATA) as AWSServiceType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => setSelectedTool(type)}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${
                      selectedTool === type 
                        ? 'border-orange-500 bg-orange-500/10' 
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className={`${SERVICE_METADATA[type].color} p-2 rounded text-white mb-2`}>
                      {SERVICE_METADATA[type].icon}
                    </div>
                    <span className="text-xs font-medium">{type}</span>
                    <span className="text-[10px] text-slate-500 mt-1">${SERVICE_METADATA[type].cost}/hr</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-800 border-t border-slate-700">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-400">Monthly Budget</span>
            <span className={totalCost > currentScenario.budget ? 'text-red-400 font-bold' : 'text-green-400'}>
              ${totalCost} / ${currentScenario.budget}
            </span>
          </div>
          <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${totalCost > currentScenario.budget ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, (totalCost / currentScenario.budget) * 100)}%` }}
            />
          </div>
        </div>
      </aside>

      {/* Main Area: Canvas & Simulation Results */}
      <main className="flex-1 relative flex flex-col min-w-0">
        {/* Header Bar */}
        <header className="h-16 bg-slate-800/80 backdrop-blur border-b border-slate-700 flex items-center justify-between px-6 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 px-3 py-1 rounded border border-slate-700 flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Scenario:</span>
              <span className="text-sm font-semibold">{currentScenario.title}</span>
              <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
              <button 
                onClick={() => setShowScenarioDetails(true)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                title="Read scenario prompt"
              >
                <BookOpen size={14} /> View Details
              </button>
              <button 
                onClick={() => setShowScenarioPicker(true)}
                className="text-xs text-orange-500 hover:text-orange-400 hover:underline flex items-center gap-1 transition-colors"
              >
                Change <ChevronRight size={12} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={resetGame}
              className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-md flex items-center gap-2 transition"
            >
              <Trash2 size={16} /> Reset
            </button>
            <button 
              onClick={startSimulation}
              disabled={nodes.length === 0 || isSimulating}
              className="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-md font-bold flex items-center gap-2 transition shadow-lg shadow-orange-900/20"
            >
              {isSimulating ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" /> : <Play size={18} fill="currentColor" />}
              {isSimulating ? 'Architecting...' : 'Deploy & Test'}
            </button>
          </div>
        </header>

        {/* The Canvas */}
        <div 
          ref={canvasRef}
          onMouseDown={handleCanvasClick}
          className={`flex-1 relative overflow-hidden transition-all duration-500 ${
            selectedTool ? 'cursor-crosshair' : (draggingNodeId ? 'cursor-grabbing' : 'cursor-default')
          }`}
          style={{
            backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        >
          {/* SVG for connections */}
          <svg className="absolute inset-0 pointer-events-none w-full h-full">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="25" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
              </marker>
            </defs>
            {connections.map((conn, idx) => {
              const fromNode = nodes.find(n => n.id === conn.from);
              const toNode = nodes.find(n => n.id === conn.to);
              if (!fromNode || !toNode) return null;
              return (
                <line
                  key={`conn-${idx}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke="#64748b"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead)"
                  className={`${draggingNodeId ? '' : 'animate-pulse'}`}
                />
              );
            })}
            {connectionStart && (() => {
               const node = nodes.find(n => n.id === connectionStart);
               return node ? (
                 <circle cx={node.x} cy={node.y} r="35" fill="none" stroke="#f97316" strokeDasharray="5,5" />
               ) : null;
            })()}
          </svg>

          {/* Render Nodes */}
          {nodes.map(node => (
            <div
              key={node.id}
              onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 group transition-all duration-200 ${
                draggingNodeId === node.id ? 'z-30 scale-110 cursor-grabbing' : 'z-10 cursor-grab hover:scale-105 active:scale-95'
              } ${connectionStart === node.id ? 'z-20' : ''} ${selectedNodeId === node.id ? 'ring-4 ring-orange-500 scale-105 z-20' : ''}`}
              style={{ left: node.x, top: node.y }}
            >
              <div className={`${SERVICE_METADATA[node.type].color} p-4 rounded-xl shadow-xl ring-4 ring-slate-900 group-hover:ring-orange-500/50 transition-all relative`}>
                <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-40 text-white">
                  <GripVertical size={10} />
                </div>
                {SERVICE_METADATA[node.type].icon}
                {/* Visual indicator for configs */}
                {Object.values(node.config).some(v => v === true) && (
                  <div className="absolute -top-1 -right-1 bg-green-500 rounded-full border-2 border-slate-900 p-0.5">
                    <CheckCircle2 size={8} className="text-white" />
                  </div>
                )}
              </div>
              <div className={`absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-[10px] font-bold px-2 py-0.5 rounded border ${selectedNodeId === node.id ? 'border-orange-500' : 'border-slate-700'} whitespace-nowrap opacity-80 group-hover:opacity-100`}>
                {node.label}
              </div>
            </div>
          ))}

          {/* UI Overlays */}
          {!simulationResult && nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
              <HelpCircle size={64} className="mb-4 opacity-20" />
              <p className="text-xl font-medium">AWS Design Lab</p>
              <p className="text-sm">Place services, then click them to configure invisible settings.</p>
              <div className="mt-6 flex gap-4 text-xs">
                <span className="flex items-center gap-1 bg-slate-800 px-3 py-1 rounded-full"><Settings2 size={12} /> Toggles for OAC, Multi-AZ, etc.</span>
                <span className="flex items-center gap-1 bg-slate-800 px-3 py-1 rounded-full"><Plus size={12} /> Click to place</span>
                <span className="flex items-center gap-1 bg-slate-800 px-3 py-1 rounded-full"><Repeat size={12} /> Connect layers</span>
              </div>
            </div>
          )}

          {/* Floating Result Panel */}
          {simulationResult && (
            <div className="absolute top-6 right-6 bottom-6 w-[450px] bg-slate-800/95 backdrop-blur-md rounded-2xl border border-slate-700 shadow-2xl z-20 flex flex-col overflow-hidden">
              <div className="p-6 border-b border-slate-700 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">Architecture Review</h2>
                  <p className="text-xs text-slate-400">Settings analyzed</p>
                </div>
                <div className={`text-3xl font-black ${simulationResult.score >= 80 ? 'text-green-500' : simulationResult.score >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {simulationResult.score}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <section>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Info size={14} /> Architect&apos;s Notes
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-300 italic">
                    &quot;{simulationResult.feedback}&quot;
                  </p>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <AlertTriangle size={14} /> Configuration Flaws
                  </h3>
                  <ul className="space-y-2">
                    {simulationResult.bottlenecks.map((b, i) => (
                      <li key={i} className="text-xs flex items-center gap-2 bg-red-500/10 border border-red-500/20 p-2 rounded text-red-300">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" /> {b}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Lightbulb size={14} className="text-yellow-500" /> Architect&apos;s Hints
                  </h3>
                  <ul className="space-y-3">
                    {simulationResult.hints.map((h, i) => (
                      <li key={i} className="text-sm text-slate-300 bg-slate-700/30 p-3 rounded-lg border border-slate-600/30">
                        {h}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="h-48 pb-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    Traffic Simulation
                  </h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={simulationResult.trafficStats}>
                      <defs>
                        <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorProc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="load" stroke="#f97316" fillOpacity={1} fill="url(#colorLoad)" name="Incoming Traffic" />
                      <Area type="monotone" dataKey="processed" stroke="#22c55e" fillOpacity={1} fill="url(#colorProc)" name="Processed" />
                    </AreaChart>
                  </ResponsiveContainer>
                </section>
              </div>

              <div className="p-6 bg-slate-900/50 border-t border-slate-700">
                <button 
                  onClick={() => setSimulationResult(null)}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-bold transition"
                >
                  Return to Drafting
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Scenario Detail Modal (Prompt View) */}
      {showScenarioDetails && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 max-w-xl w-full shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <BookOpen className="text-orange-500" /> Scenario Briefing
              </h2>
              <button 
                onClick={() => setShowScenarioDetails(false)}
                className="p-2 hover:bg-slate-700 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-8">
              <h3 className="text-2xl font-black mb-4 text-orange-500">{currentScenario.title}</h3>
              <p className="text-slate-300 leading-relaxed text-lg mb-8">
                {currentScenario.description}
              </p>
              
              <div className="grid grid-cols-2 gap-6 p-6 bg-slate-900/50 rounded-2xl border border-slate-700">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Target Throughput</div>
                  <div className="text-xl font-bold text-white">{currentScenario.targetRPS.toLocaleString()} <span className="text-sm font-medium text-slate-400">req/min</span></div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Infrastructure Budget</div>
                  <div className="text-xl font-bold text-white">${currentScenario.budget} <span className="text-sm font-medium text-slate-400">/hr</span></div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Architecture Level</div>
                  <div className={`text-lg font-bold ${
                    currentScenario.difficulty === 'Easy' ? 'text-green-400' :
                    currentScenario.difficulty === 'Medium' ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>{currentScenario.difficulty}</div>
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-900/30 border-t border-slate-700 flex justify-end">
              <button 
                onClick={() => setShowScenarioDetails(false)}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition-all"
              >
                Got it, let&apos;s build
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scenario Picker Modal */}
      {showScenarioPicker && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 max-w-2xl w-full shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-slate-700 bg-gradient-to-br from-orange-600/20 to-transparent">
              <h2 className="text-3xl font-black mb-2">Choose Your Challenge</h2>
              <p className="text-slate-400">Select an infrastructure scenario to architect.</p>
            </div>
            <div className="p-8 grid gap-4">
              {SCENARIOS.map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    setCurrentScenario(s);
                    setShowScenarioPicker(false);
                    resetGame();
                  }}
                  className="group flex items-center justify-between p-6 rounded-2xl border border-slate-700 bg-slate-900/50 hover:border-orange-500 hover:bg-orange-500/5 transition-all text-left"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold group-hover:text-orange-500 transition-colors">{s.title}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        s.difficulty === 'Easy' ? 'bg-green-500/20 text-green-400' :
                        s.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {s.difficulty}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">{s.description}</p>
                    <div className="flex gap-4 mt-3">
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 uppercase font-bold tracking-wider">
                        Target Load: <span className="text-slate-200">{s.targetRPS.toLocaleString()}/min</span>
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 uppercase font-bold tracking-wider">
                        Budget: <span className="text-slate-200">${s.budget}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={24} className="text-slate-700 group-hover:text-orange-500 transition-colors" />
                </button>
              ))}
            </div>
            <div className="px-8 pb-8">
              <p className="text-xs text-center text-slate-500 italic">
                Architectures are evaluated based on industry standards for high availability and efficiency.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
