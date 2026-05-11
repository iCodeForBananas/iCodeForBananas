"use client";

import React, { useRef, useState, useEffect } from "react";
import { Image as ImageIcon, Paintbrush, Eraser, Download, Upload, Trash2 } from "lucide-react";

interface PhotoMockupProps {
  onMockupChange: (dataUrl: string) => void;
  initialMockup?: string;
}

export const PhotoMockup: React.FC<PhotoMockupProps> = ({ onMockupChange, initialMockup }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"paint" | "erase">("paint");
  const [brushSize, setBrushSize] = useState(20);
  const [hasImage, setHasImage] = useState(false);

  useEffect(() => {
    if (initialMockup && !image) {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setHasImage(true);
        renderCanvas(img);
      };
      img.src = initialMockup;
    }
  }, [initialMockup]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const containerWidth = canvas.parentElement?.clientWidth || 800;
    const scale = containerWidth / img.width;
    canvas.width = containerWidth;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setHasImage(true);
        renderCanvas(img);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) onMockupChange(canvas.toDataURL());
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ("touches" in e ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = brushSize;
    if (tool === "paint") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(20, 20, 20, 0.6)";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    }
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-white rounded-2xl shadow-2xl border border-brand-primary/10 flex flex-col">
      <div className="flex items-center justify-between border-b border-brand-primary/10 p-4 bg-white/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <ImageIcon size={20} className="text-brand-accent" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-brand-primary">
            Photo Mockup Tool
          </h2>
        </div>
        {hasImage && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTool("paint")}
              className={`p-2 rounded-lg transition-all ${tool === "paint" ? "bg-brand-primary text-white" : "bg-brand-bg text-brand-primary/40"}`}
              title="Paint Asphalt"
            >
              <Paintbrush size={18} />
            </button>
            <button
              onClick={() => setTool("erase")}
              className={`p-2 rounded-lg transition-all ${tool === "erase" ? "bg-brand-primary text-white" : "bg-brand-bg text-brand-primary/40"}`}
              title="Eraser"
            >
              <Eraser size={18} />
            </button>
            <div className="h-6 w-px bg-brand-primary/10 mx-1" />
            <button
              onClick={() => image && renderCanvas(image)}
              className="p-2 bg-brand-bg text-brand-primary/40 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all"
              title="Reset Image"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 p-6 flex flex-col min-h-0">
        {!hasImage ? (
          <label className="flex flex-col items-center justify-center flex-1 border-2 border-dashed border-brand-primary/10 rounded-xl bg-slate-50 cursor-pointer hover:bg-slate-100 transition-all group">
            <Upload size={48} className="text-brand-primary/20 group-hover:text-brand-accent transition-colors mb-4" />
            <p className="text-sm font-bold text-brand-primary/60">Upload Driveway Photo</p>
            <p className="text-xs text-brand-primary/40 mt-1">
              Select a photo of the existing driveway to begin mockup
            </p>
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </label>
        ) : (
          <div className="relative flex-1 overflow-hidden rounded-xl bg-slate-50 border border-brand-primary/5 cursor-crosshair flex items-center justify-center">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="max-w-full max-h-full object-contain block"
            />
            <div className="absolute bottom-4 right-4">
              <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg border border-brand-primary/10 shadow-lg flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-brand-primary/40">
                  Brush Size
                </label>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-32 accent-brand-accent"
                />
              </div>
            </div>
          </div>
        )}
        {hasImage && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-brand-bg/50 rounded-lg border border-brand-primary/5">
            <Paintbrush size={14} className="text-brand-accent shrink-0" />
            <p className="text-[10px] text-brand-primary/60">
              Tip: Use the paint tool to simulate new asphalt. The semi-transparent layer shows
              existing textures for a realistic preview.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
