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
  Sun,
  Moon,
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [exportPixelRatio, setExportPixelRatio] = useState(5);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isResizing = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Initialize Mermaid + sidebar width on mount (client-only).
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

  // Load diagrams from IndexedDB on mount
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

  // Auto-save active diagram with debounce
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

  // Mouse wheel zoom
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

  // Re-initialize Mermaid when theme changes
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: theme === "dark" ? "dark" : "default",
      securityLevel: "loose",
      fontFamily: "Inter, sans-serif",
      fontSize: 16,
      flowchart: {
        htmlLabels: false,
        curve: "basis",
        useMaxWidth: false,
      },
    });

    const renderChart = async () => {
      if (!activeDiagram?.code.trim()) return;
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, activeDiagram.code);
        const responsiveSvg = svg
          .replace(/width="[^"]*"/, 'width="100%"')
          .replace(/height="[^"]*"/, 'height="auto"');
        setSvg(responsiveSvg);
        setError(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Invalid Mermaid syntax";
        setError(message);
      }
    };
    renderChart();
  }, [theme, activeDiagram?.id]);

  // Render Mermaid on code change
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
  }, [activeDiagram?.code, theme]);

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
          backgroundColor: theme === "dark" ? "#18181b" : "#ffffff",
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
    <div
      className={`mermaid-flow-root flex flex-col h-full font-sans overflow-hidden transition-colors duration-300 ${
        theme === "dark" ? "bg-zinc-950 text-zinc-100" : "bg-zinc-50 text-zinc-900"
      }`}
    >
      <style jsx global>{`
        .mermaid-flow-root .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .mermaid-flow-root .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .mermaid-flow-root .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(110, 110, 110, 0.2);
          border-radius: 10px;
        }
        .mermaid-flow-root .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(110, 110, 110, 0.4);
        }
        .mermaid-flow-root .mermaid text {
          font-family: "Inter", sans-serif !important;
        }
      `}</style>

      {/* Header */}
      <header
        className={`h-16 border-b flex items-center justify-between px-6 shrink-0 z-10 shadow-sm transition-colors duration-300 ${
          theme === "dark" ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
            <Share2 size={18} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Mermaid Flow</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
            className={`p-2 rounded-lg transition-colors ${
              theme === "dark"
                ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          <div className={`w-px h-6 mx-1 ${theme === "dark" ? "bg-zinc-800" : "bg-zinc-200"}`} />

          <button
            onClick={handleShare}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              theme === "dark"
                ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
            title="Copy share link"
          >
            {copied ? <Check size={16} className="text-emerald-500" /> : <Share2 size={16} />}
            {copied ? "Copied!" : "Share"}
          </button>

          <button
            onClick={handleExportPng}
            disabled={!!error || !svg || isExporting}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
              isExporting
                ? "bg-emerald-500 text-white/80 cursor-wait"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download size={16} />
                Export PNG
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        {/* Editor Pane */}
        <div
          style={{ width: sidebarWidth }}
          className={`flex flex-col border-r shrink-0 transition-colors duration-300 ${
            theme === "dark" ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
          }`}
        >
          {/* Searchable Dropdown */}
          <div
            className={`flex flex-col border-b ${
              theme === "dark" ? "bg-zinc-950/50 border-zinc-800" : "bg-zinc-50 border-zinc-200"
            }`}
          >
            <div className="px-4 py-3">
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    theme === "dark"
                      ? "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700"
                      : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText size={14} className="text-emerald-500 shrink-0" />
                    <span className="truncate">{activeDiagram?.name || "Select Diagram"}</span>
                  </div>
                  <RotateCcw
                    size={12}
                    className={`transition-transform duration-200 ${
                      isDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {isDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className={`absolute top-full left-0 right-0 mt-2 rounded-xl border shadow-xl z-50 overflow-hidden ${
                        theme === "dark"
                          ? "bg-zinc-900 border-zinc-800 shadow-black/50"
                          : "bg-white border-zinc-200 shadow-zinc-200/50"
                      }`}
                    >
                      <div
                        className={`p-2 border-b ${
                          theme === "dark" ? "border-zinc-800" : "border-zinc-100"
                        }`}
                      >
                        <div className="relative">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search diagrams..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-md outline-none transition-colors ${
                              theme === "dark"
                                ? "bg-zinc-950 text-zinc-300 placeholder-zinc-600"
                                : "bg-zinc-50 text-zinc-700 placeholder-zinc-400"
                            }`}
                          />
                          <Share2
                            size={12}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                          />
                        </div>
                      </div>

                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                        {filteredDiagrams.length === 0 ? (
                          <div className="px-3 py-4 text-center text-xs text-zinc-500">
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
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "text-zinc-500 hover:bg-zinc-500/5 hover:text-zinc-200"
                              }`}
                            >
                              <FileText
                                size={14}
                                className={
                                  activeId === diagram.id ? "text-emerald-500" : "text-zinc-600"
                                }
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

                      <div
                        className={`p-1 border-t ${
                          theme === "dark" ? "border-zinc-800" : "border-zinc-100"
                        }`}
                      >
                        <button
                          onClick={() => {
                            handleCreateTab();
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                            theme === "dark"
                              ? "text-emerald-500 hover:bg-emerald-500/10"
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
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

          <div
            className={`px-4 py-2 border-b flex items-center justify-between ${
              theme === "dark" ? "bg-zinc-900/50 border-zinc-800" : "bg-zinc-50 border-zinc-200"
            }`}
          >
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                theme === "dark" ? "text-zinc-500" : "text-zinc-500"
              }`}
            >
              Editor
            </span>
          </div>
          <textarea
            value={activeDiagram?.code || ""}
            onChange={(e) => updateActiveCode(e.target.value)}
            className={`flex-1 p-6 font-mono text-sm resize-none focus:outline-none transition-colors duration-300 ${
              theme === "dark"
                ? "bg-zinc-950/50 text-zinc-300 placeholder-zinc-700"
                : "bg-zinc-50/30 text-zinc-800 placeholder-zinc-400"
            }`}
            spellCheck={false}
            placeholder="Enter mermaid code here..."
          />
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={startResizing}
          className={`w-1.5 hover:w-2 cursor-col-resize transition-all shrink-0 z-20 flex items-center justify-center group ${
            theme === "dark" ? "bg-zinc-900 hover:bg-emerald-500" : "bg-zinc-100 hover:bg-emerald-400"
          }`}
        >
          <div
            className={`w-0.5 h-8 rounded-full transition-colors ${
              theme === "dark" ? "bg-zinc-800 group-hover:bg-white" : "bg-zinc-300 group-hover:bg-white"
            }`}
          />
        </div>

        {/* Preview Pane */}
        <div
          className={`flex-1 flex flex-col relative overflow-hidden transition-colors duration-300 ${
            theme === "dark" ? "bg-zinc-950" : "bg-zinc-100/50"
          }`}
        >
          <div
            className={`px-4 py-2 border-b flex items-center justify-between z-30 transition-colors duration-300 ${
              theme === "dark" ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-200"
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-4">
              <span className="flex items-center gap-1.5">Preview</span>
              <div
                className={`flex items-center gap-3 font-normal normal-case tracking-normal ${
                  theme === "dark" ? "text-zinc-600" : "text-zinc-400"
                }`}
              >
                <span className="flex items-center gap-1">
                  <ZoomIn size={12} /> Scroll to Zoom
                </span>
                <span className="flex items-center gap-1">
                  <Move size={12} /> Drag to Pan
                </span>
              </div>
            </span>

            <div className="flex items-center gap-2">
              <div
                className={`flex items-center border rounded-lg overflow-hidden shadow-sm transition-colors duration-300 ${
                  theme === "dark" ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
                }`}
              >
                <div
                  className={`px-2 py-1 text-[10px] font-bold border-r transition-colors ${
                    theme === "dark"
                      ? "text-zinc-500 border-zinc-800"
                      : "text-zinc-500 border-zinc-200"
                  }`}
                >
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
                  className={`w-10 py-1 text-[10px] font-bold text-center focus:outline-none transition-colors ${
                    theme === "dark" ? "bg-zinc-900 text-zinc-300" : "bg-white text-zinc-700"
                  }`}
                  title="Export Pixel Ratio (1-20)"
                />
              </div>

              <div
                className={`flex items-center border rounded-lg overflow-hidden shadow-sm transition-colors duration-300 ${
                  theme === "dark" ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
                }`}
              >
                <button
                  onClick={handleZoomOut}
                  className={`p-1.5 border-r transition-colors ${
                    theme === "dark"
                      ? "hover:bg-zinc-800 text-zinc-400 border-zinc-800"
                      : "hover:bg-zinc-50 text-zinc-600 border-zinc-200"
                  }`}
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <div
                  className={`px-2 text-[10px] font-bold min-w-[45px] text-center ${
                    theme === "dark" ? "text-zinc-500" : "text-zinc-500"
                  }`}
                >
                  {Math.round(zoom * 100)}%
                </div>
                <button
                  onClick={handleZoomIn}
                  className={`p-1.5 border-l transition-colors ${
                    theme === "dark"
                      ? "hover:bg-zinc-800 text-zinc-400 border-zinc-800"
                      : "hover:bg-zinc-50 text-zinc-600 border-zinc-200"
                  }`}
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
              <button
                onClick={handleResetZoom}
                className={`p-1.5 border rounded-lg transition-colors shadow-sm ${
                  theme === "dark"
                    ? "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-400"
                    : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-600"
                }`}
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
                    className={`max-w-md p-4 border rounded-xl text-sm shadow-sm z-10 ${
                      theme === "dark"
                        ? "bg-red-950/30 border-red-900/50 text-red-400"
                        : "bg-red-50 border-red-200 text-red-600"
                    }`}
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
                    className={`p-12 rounded-2xl shadow-2xl border min-w-[100px] min-h-[100px] flex items-center justify-center transition-colors duration-300 ${
                      theme === "dark"
                        ? "bg-zinc-900 border-zinc-800 shadow-black/50"
                        : "bg-white border-zinc-200 shadow-zinc-200/50"
                    }`}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
