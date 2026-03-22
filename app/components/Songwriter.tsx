"use client";

import { useState, useRef, useEffect } from "react";

const LINE_HEIGHT = 1.5;

export default function Songwriter() {
  const [text, setText] = useState("");
  const [columns, setColumns] = useState<string[]>([""]);
  const [columnWidth, setColumnWidth] = useState(340);
  const [fontSize, setFontSize] = useState(16);
  const [activeCol, setActiveCol] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const lineHeightPx = fontSize * LINE_HEIGHT;
    const availableHeight = containerRef.current.clientHeight - 64; // 32px padding + 32px column header
    const linesPerColumn = Math.max(1, Math.floor(availableHeight / lineHeightPx));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.font = `${fontSize}px monospace`;
    const lines = text.split("\n");
    const maxLineWidth = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    setColumnWidth(Math.max(maxLineWidth + 48, 200));

    if (!text) {
      setColumns([""]);
      return;
    }

    const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += linesPerColumn) {
      chunks.push(lines.slice(i, i + linesPerColumn).join("\n"));
    }
    setColumns(chunks);
  }, [text, fontSize]);

  // Keep cursor in active column after re-render
  useEffect(() => {
    textareaRefs.current[activeCol]?.focus();
  }, [columns, activeCol]);

  const handleChange = (colIndex: number, value: string) => {
    const updated = columns.map((c, i) => (i === colIndex ? value : c));
    setText(updated.join("\n"));
    setActiveCol(colIndex);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="bg-gradient-to-r from-[#4C6EF5] to-[#4C6EF5] border-b border-[#373A40]/30 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-xl font-bold text-[#000000]">Songwriter</h1>
        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium text-[#F8F9FA]">Font Size:</label>
          <input
            type="range" min="12" max="32" value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value))}
            className="w-32"
          />
          <span className="text-sm text-[#909296] w-12">{fontSize}px</span>
          <button
            onClick={() => { if (confirm("Clear all text?")) { setText(""); setActiveCol(0); } }}
            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-medium transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Columns */}
      <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-hidden bg-gradient-to-br from-[#4C6EF5]/10 to-[#4C6EF5]/10">
        <div className="flex h-full p-4 gap-4">
          {columns.map((col, i) => (
            <div
              key={i}
              className={`flex-shrink-0 border-2 rounded-lg bg-white shadow-md overflow-hidden ${activeCol === i ? "border-[#373A40]" : "border-gray-300"}`}
              style={{ width: `${columnWidth}px`, height: "100%" }}
            >
              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 border-b border-gray-100">
                Column {i + 1}
              </div>
              <textarea
                ref={(el) => { textareaRefs.current[i] = el; }}
                value={col}
                onChange={(e) => handleChange(i, e.target.value)}
                onFocus={() => setActiveCol(i)}
                placeholder={i === 0 ? "Paste or type your lyrics here..." : ""}
                className="w-full h-[calc(100%-32px)] resize-none border-none outline-none font-mono bg-transparent p-4 overflow-hidden"
                style={{ fontSize: `${fontSize}px`, lineHeight: LINE_HEIGHT, whiteSpace: "pre" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
