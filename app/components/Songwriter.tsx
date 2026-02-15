"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";

export default function Songwriter() {
  const [text, setText] = useState("");
  const [columns, setColumns] = useState<string[]>([""]);
  const [fontSize, setFontSize] = useState(16);
  const [activeColumn, setActiveColumn] = useState(0);
  const [columnWidth, setColumnWidth] = useState(500);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const LINE_HEIGHT_MULTIPLIER = 1.5;

  const measureTextDimensions = useCallback(() => {
    if (!measureRef.current) return { longestLineWidth: 500, lineHeight: fontSize * LINE_HEIGHT_MULTIPLIER };

    // Create a temporary span to measure text
    const span = document.createElement("span");
    span.style.font = `${fontSize}px monospace`;
    span.style.whiteSpace = "pre";
    span.style.visibility = "hidden";
    span.style.position = "absolute";
    document.body.appendChild(span);

    const lines = text.split("\n");
    let maxWidth = 0;

    // Measure each line to find the longest
    lines.forEach((line) => {
      span.textContent = line || " ";
      const width = span.offsetWidth;
      if (width > maxWidth) {
        maxWidth = width;
      }
    });

    document.body.removeChild(span);

    const lineHeight = fontSize * LINE_HEIGHT_MULTIPLIER;

    // Add padding for textarea
    const calculatedWidth = Math.max(maxWidth + 100, 300);

    return { longestLineWidth: calculatedWidth, lineHeight };
  }, [fontSize, text]);

  const arrangeTextIntoColumns = useCallback(() => {
    if (!containerRef.current) return;

    const { longestLineWidth, lineHeight } = measureTextDimensions();
    setColumnWidth(longestLineWidth);

    const containerHeight = containerRef.current.clientHeight;
    // Account for toolbar, instructions, and padding
    const availableHeight = containerHeight - 40; // padding
    const linesPerColumn = Math.floor(availableHeight / lineHeight);

    if (linesPerColumn <= 0) {
      setColumns([text]);
      return;
    }

    const lines = text.split("\n");
    const chunkedColumns: string[] = [];
    let currentChunk: string[] = [];

    for (const line of lines) {
      currentChunk.push(line);

      if (currentChunk.length >= linesPerColumn) {
        chunkedColumns.push(currentChunk.join("\n"));
        currentChunk = [];
      }
    }

    if (currentChunk.length > 0) {
      chunkedColumns.push(currentChunk.join("\n"));
    }

    setColumns(chunkedColumns.length > 0 ? chunkedColumns : [""]);
  }, [measureTextDimensions, text]);

  // Recalculate columns whenever text or font size changes
  useEffect(() => {
    if (!text) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting columns when text is cleared
      setColumns([""]);
      return;
    }

    arrangeTextIntoColumns();
  }, [text, fontSize, arrangeTextIntoColumns]);

  useEffect(() => {
    if (textareaRefs.current[activeColumn]) {
      textareaRefs.current[activeColumn]?.focus();
    }
  }, [activeColumn]);

  // Scroll first column to top after arranging into columns
  useEffect(() => {
    if (textareaRefs.current[0]) {
      textareaRefs.current[0].scrollTop = 0;
    }
  }, [columns]);

  const handleTextInput = (value: string) => {
    setText(value);
  };

  const handlePaste = () => {
    // Default paste will update via onChange
  };

  const handleKeyDown = (columnIndex: number, e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "ArrowRight" && e.ctrlKey && columnIndex < columns.length - 1) {
      e.preventDefault();
      setActiveColumn(columnIndex + 1);
    }
    if (e.key === "ArrowLeft" && e.ctrlKey && columnIndex > 0) {
      e.preventDefault();
      setActiveColumn(columnIndex - 1);
    }
  };

  const clearAll = () => {
    if (confirm("Are you sure you want to clear all text?")) {
      setText("");
      setColumns([""]);
      setActiveColumn(0);
    }
  };

  return (
    <div className='flex flex-col h-full metronome-static'>
      {/* Toolbar */}
      <div className='bg-gradient-to-r from-pink-100 to-orange-100 border-b border-pink-200 px-4 py-3 flex items-center justify-between'>
        <h1 className='text-xl font-bold text-gray-800'>Songwriter</h1>
        <div className='flex gap-4 items-center'>
          <div className='flex items-center gap-2'>
            <label className='text-sm font-medium text-gray-700'>Font Size:</label>
            <input
              type='range'
              min='12'
              max='32'
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className='w-32'
            />
            <span className='text-sm text-gray-600 w-12'>{fontSize}px</span>
          </div>
          <button
            onClick={clearAll}
            className='px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-medium transition-colors'
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className='bg-orange-50 border-b border-orange-200 px-4 py-2 text-sm text-gray-700'>
        <span className='font-semibold'>Tip:</span> Paste or type your lyrics. Text will automatically arrange into
        columns. Adjust font size for optimal readability. Use{" "}
        <kbd className='px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs'>Ctrl+←</kbd> and{" "}
        <kbd className='px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs'>Ctrl+→</kbd> to navigate between
        columns.
      </div>

      {/* Column Container */}
      <div
        ref={containerRef}
        className='flex-1 overflow-x-auto overflow-y-hidden bg-gradient-to-br from-pink-50 to-orange-50'
      >
        {/* Hidden measurement element */}
        <div ref={measureRef} style={{ position: "absolute", visibility: "hidden" }} />

        <div className='flex h-full p-4 gap-4 justify-center'>
          {columns.map((columnText, index) => (
            <div
              key={index}
              className={`flex flex-col flex-shrink-0 border-2 rounded-lg p-4 bg-white shadow-md transition-all ${
                activeColumn === index ? "border-pink-400 shadow-lg" : "border-gray-300"
              }`}
              style={{ width: `${columnWidth}px`, height: "100%" }}
              onClick={() => setActiveColumn(index)}
            >
              <div className='flex items-center justify-between mb-2 flex-shrink-0'>
                <span className='text-sm font-semibold text-gray-600'>Column {index + 1}</span>
              </div>
              <textarea
                ref={(el) => {
                  textareaRefs.current[index] = el;
                }}
                value={index === 0 ? text : columnText}
                onChange={(e) => {
                  if (index === 0) {
                    handleTextInput(e.target.value);
                  }
                }}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onFocus={() => setActiveColumn(index)}
                onPaste={handlePaste}
                readOnly={index !== 0}
                className='w-full flex-1 resize-none border-none outline-none font-mono bg-transparent overflow-hidden'
                placeholder={index === 0 ? "Start writing or paste your lyrics here..." : ""}
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: LINE_HEIGHT_MULTIPLIER,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
