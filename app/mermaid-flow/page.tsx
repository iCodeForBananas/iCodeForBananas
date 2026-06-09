"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import mermaid from "mermaid";
import { toPng } from "html-to-image";
import {
  Download,
  Share2,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move,
  Plus,
  Edit2,
  FileText,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence, useMotionValue } from "motion/react";
import { storage, Diagram } from "./storage";

const DEFAULT_CHART = `graph TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- No --> D[Keep trying]
    D --> B
    C --> E[End]`;

export default function MermaidFlowPage() {
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const activeDiagram = useMemo(
    () => diagrams.find((d) => d.id === activeId) || null,
    [diagrams, activeId],
  );

  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(480);
  const [zoom, setZoom] = useState(1);
  const [exportPixelRatio, setExportPixelRatio] = useState(5);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isResizing = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: "default",
      securityLevel: "loose",
      fontFamily: "Inter, sans-serif",
      fontSize: 16,
      flowchart: {
        htmlLabels: true,
        curve: "basis",
        useMaxWidth: false,
      },
    });
    setSidebarWidth(window.innerWidth * 0.3);
  }, []);

  useEffect(() => {
    const init = async () => {
      const all = await storage.getAll();

      const params = new URLSearchParams(window.location.search);
      const sharedCode = params.get("code");

      let initialDiagrams = all;
      let initialActiveId = localStorage.getItem("mermaid-flow-active-id");

      if (sharedCode) {
        try {
          const decoded = atob(sharedCode);
          const newId = `shared-${Date.now()}`;
          const sharedDiagram: Diagram = {
            id: newId,
            name: "Shared Diagram",
            code: decoded,
            updatedAt: Date.now(),
          };
          initialDiagrams = [sharedDiagram, ...all];
          initialActiveId = newId;
          window.history.replaceState({}, "", window.location.pathname);
        } catch (e) {
          console.error("Failed to decode shared code", e);
        }
      }

      if (initialDiagrams.length === 0) {
        const defaultDiagram: Diagram = {
          id: "default",
          name: "Main Diagram",
          code: DEFAULT_CHART,
          updatedAt: Date.now(),
        };
        await storage.save(defaultDiagram);
        initialDiagrams = [defaultDiagram];
        initialActiveId = "default";
      }

      setDiagrams(initialDiagrams);
      if (!initialActiveId || !initialDiagrams.find((d) => d.id === initialActiveId)) {
        initialActiveId = initialDiagrams[0].id;
      }
      setActiveId(initialActiveId);
      setIsLoaded(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (activeId) {
      localStorage.setItem("mermaid-flow-active-id", activeId);
    }
  }, [activeId]);

  const handleCreateTab = async () => {
    const newId = `diagram-${Date.now()}`;
    const newDiagram: Diagram = {
      id: newId,
      name: `Untitled ${diagrams.length + 1}`,
      code: DEFAULT_CHART,
      updatedAt: Date.now(),
    };
    await storage.save(newDiagram);
    setDiagrams((prev) => [newDiagram, ...prev]);
    setActiveId(newId);
  };

  const handleDeleteTab = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (diagrams.length <= 1) return;

    await storage.delete(id);
    const newDiagrams = diagrams.filter((d) => d.id !== id);
    setDiagrams(newDiagrams);
    if (activeId === id) {
      setActiveId(newDiagrams[0].id);
    }
  };

  const handleRenameTab = async (id: string, newName: string) => {
    const diagram = diagrams.find((d) => d.id === id);
    if (!diagram || !newName.trim()) return;

    const updated = { ...diagram, name: newName.trim() };
    await storage.save(updated);
    setDiagrams((prev) => prev.map((d) => (d.id === id ? updated : d)));
    setEditingTabId(null);
  };

  const updateActiveCode = (newCode: string) => {
    if (!activeId) return;
    setDiagrams((prev) => prev.map((d) => (d.id === activeId ? { ...d, code: newCode } : d)));
  };

  useEffect(() => {
    if (!activeDiagram || !isLoaded) return;

    const timeoutId = setTimeout(async () => {
      await storage.save(activeDiagram);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [activeDiagram, isLoaded]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.4, 10));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.4, 0.1));
  const handleResetZoom = () => {
    setZoom(1);
    x.set(0);
    y.set(0);
  };

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      setZoom((prev) => {
        const newZoom = Math.max(0.1, Math.min(10, prev + delta));
        return parseFloat(newZoom.toFixed(2));
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(200, Math.min(e.clientX, window.innerWidth - 200));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const renderChart = async () => {
      if (!activeDiagram?.code.trim()) {
        setSvg("");
        setError(null);
        return;
      }

      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, activeDiagram.code);
        const responsiveSvg = svg
          .replace(/width="[^"]*"/, 'width="100%"')
          .replace(/height="[^"]*"/, 'height="auto"');
        setSvg(responsiveSvg);
        setError(null);
      } catch (err: unknown) {
        console.error("Mermaid render error:", err);
        const message = err instanceof Error ? err.message : "Invalid Mermaid syntax";
        setError(message);
      }
    };

    const timeoutId = setTimeout(renderChart, 300);
    return () => clearTimeout(timeoutId);
  }, [activeDiagram?.code]);

  const [isExporting, setIsExporting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredDiagrams = useMemo(() => {
    return diagrams.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [diagrams, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExportPng = async () => {
    if (previewRef.current && !isExporting) {
      try {
        setIsExporting(true);
        const dataUrl = await toPng(previewRef.current, {
          backgroundColor: "#ffffff",
          pixelRatio: exportPixelRatio,
          quality: 1,
          skipFonts: false,
          cacheBust: true,
          style: {
            transform: "none",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
            textRendering: "optimizeLegibility",
          } as Partial<CSSStyleDeclaration>,
        });

        const link = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        link.download = `mermaid-diagram-${timestamp}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error("Export failed", err);
      } finally {
        setIsExporting(false);
      }
    }
  };

  const handleShare = () => {
    if (!activeDiagram) return;
    const encoded = btoa(activeDiagram.code);
    const url = new URL(window.location.href);
    url.searchParams.set("code", encoded);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
        <div
          className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden"
          style={{ background: "#fff", border: "1px solid var(--border-color)" }}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 shrink-0">
            <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4 flex items-center justify-between">
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight" style={{ color: "#000" }}>
                Mermaid Flow
              </h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
                  title="Copy share link"
                >
                  {copied ? <Check size={15} className="text-emerald-500" /> : <Share2 size={15} />}
                  {copied ? "Copied!" : "Share"}
                </button>
                <button
                  onClick={handleExportPng}
                  disabled={!!error || !svg || isExporting}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      Export PNG
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Editor + Preview */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Editor Pane */}
            <div
              style={{ width: sidebarWidth }}
              className="flex flex-col border-r border-zinc-200 shrink-0 bg-white"
            >
              {/* Diagram selector */}
              <div className="flex flex-col border-b border-zinc-200 bg-zinc-50">
                <div className="px-4 py-3">
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:border-zinc-300 transition-all"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText size={14} className="text-emerald-500 shrink-0" />
                        <span className="truncate">{activeDiagram?.name || "Select Diagram"}</span>
                      </div>
                      <RotateCcw
                        size={12}
                        className={`text-zinc-400 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    <AnimatePresence>
                      {isDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-zinc-200 bg-white shadow-xl z-50 overflow-hidden"
                        >
                          <div className="p-2 border-b border-zinc-100">
                            <div className="relative">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Search diagrams..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-zinc-50 text-zinc-700 placeholder-zinc-400 outline-none"
                              />
                              <Share2
                                size={12}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                              />
                            </div>
                          </div>

                          <div className="max-h-[300px] overflow-y-auto p-1">
                            {filteredDiagrams.length === 0 ? (
                              <div className="px-3 py-4 text-center text-xs text-zinc-400">
                                No diagrams found
                              </div>
                            ) : (
                              filteredDiagrams.map((diagram) => (
                                <div
                                  key={diagram.id}
                                  onClick={() => {
                                    setActiveId(diagram.id);
                                    setIsDropdownOpen(false);
                                    setSearchQuery("");
                                  }}
                                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                                    activeId === diagram.id
                                      ? "bg-emerald-50 text-emerald-600"
                                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
                                  }`}
                                >
                                  <FileText
                                    size={14}
                                    className={activeId === diagram.id ? "text-emerald-500" : "text-zinc-400"}
                                  />

                                  {editingTabId === diagram.id ? (
                                    <input
                                      autoFocus
                                      className="flex-1 bg-transparent outline-none text-xs font-medium"
                                      value={tempName}
                                      onChange={(e) => setTempName(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      onBlur={() => handleRenameTab(diagram.id, tempName)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleRenameTab(diagram.id, tempName);
                                        if (e.key === "Escape") setEditingTabId(null);
                                      }}
                                    />
                                  ) : (
                                    <span className="flex-1 text-xs font-medium truncate">
                                      {diagram.name}
                                    </span>
                                  )}

                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingTabId(diagram.id);
                                        setTempName(diagram.name);
                                      }}
                                      className="p-1 hover:text-emerald-500 transition-colors"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                    {diagrams.length > 1 && (
                                      <button
                                        onClick={(e) => handleDeleteTab(e, diagram.id)}
                                        className="p-1 hover:text-red-500 transition-colors"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="p-1 border-t border-zinc-100">
                            <button
                              onClick={() => {
                                handleCreateTab();
                                setIsDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              <Plus size={14} />
                              New Diagram
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 flex items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Editor
                </span>
              </div>

              <textarea
                value={activeDiagram?.code || ""}
                onChange={(e) => updateActiveCode(e.target.value)}
                className="flex-1 p-6 font-mono text-sm resize-none focus:outline-none bg-white text-zinc-800 placeholder-zinc-400"
                spellCheck={false}
                placeholder="Enter mermaid code here..."
              />
            </div>

            {/* Resizer Handle */}
            <div
              onMouseDown={startResizing}
              className="w-1.5 hover:w-2 cursor-col-resize transition-all shrink-0 z-20 flex items-center justify-center group bg-zinc-100 hover:bg-emerald-400"
            >
              <div className="w-0.5 h-8 rounded-full bg-zinc-300 group-hover:bg-white transition-colors" />
            </div>

            {/* Preview Pane */}
            <div className="flex-1 flex flex-col bg-zinc-50 overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-200 bg-white flex items-center justify-between z-10 shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-4">
                  <span>Preview</span>
                  <span className="flex items-center gap-3 font-normal normal-case tracking-normal text-zinc-300">
                    <span className="flex items-center gap-1">
                      <ZoomIn size={12} /> Scroll to Zoom
                    </span>
                    <span className="flex items-center gap-1">
                      <Move size={12} /> Drag to Pan
                    </span>
                  </span>
                </span>

                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden shadow-sm bg-white">
                    <div className="px-2 py-1 text-[10px] font-bold border-r border-zinc-200 text-zinc-400">
                      EXPORT SCALE
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={exportPixelRatio}
                      onChange={(e) =>
                        setExportPixelRatio(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
                      }
                      className="w-10 py-1 text-[10px] font-bold text-center focus:outline-none bg-white text-zinc-700"
                      title="Export Pixel Ratio (1-20)"
                    />
                  </div>

                  <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden shadow-sm bg-white">
                    <button
                      onClick={handleZoomOut}
                      className="p-1.5 border-r border-zinc-200 hover:bg-zinc-50 text-zinc-500 transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <div className="px-2 text-[10px] font-bold min-w-[45px] text-center text-zinc-500">
                      {Math.round(zoom * 100)}%
                    </div>
                    <button
                      onClick={handleZoomIn}
                      className="p-1.5 border-l border-zinc-200 hover:bg-zinc-50 text-zinc-500 transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn size={14} />
                    </button>
                  </div>

                  <button
                    onClick={handleResetZoom}
                    className="p-1.5 border border-zinc-200 rounded-lg bg-white hover:bg-zinc-50 text-zinc-500 transition-colors shadow-sm"
                    title="Reset Zoom & Pan"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              <div
                ref={previewContainerRef}
                className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
              >
                <AnimatePresence mode="wait">
                  {error ? (
                    <div className="absolute inset-0 flex items-center justify-center p-8">
                      <motion.div
                        key="error"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="max-w-md p-4 border border-red-200 rounded-xl text-sm shadow-sm bg-red-50 text-red-600"
                      >
                        <p className="font-bold mb-1">Syntax Error</p>
                        <p className="font-mono text-xs opacity-80">{error}</p>
                      </motion.div>
                    </div>
                  ) : (
                    <motion.div
                      key="preview-container"
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <motion.div
                        ref={previewRef}
                        drag
                        dragMomentum={false}
                        dragElastic={0}
                        style={{ x, y, scale: zoom }}
                        transition={{
                          type: "spring",
                          damping: 30,
                          stiffness: 300,
                          scale: { type: "spring", damping: 20, stiffness: 150 },
                        }}
                        className="p-12 rounded-2xl shadow-2xl border border-zinc-200 min-w-[100px] min-h-[100px] flex items-center justify-center bg-white shadow-zinc-200/50"
                        dangerouslySetInnerHTML={{ __html: svg }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
