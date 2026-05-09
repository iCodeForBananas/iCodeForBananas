"use client";

import { useState, useEffect, useRef } from "react";

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GeminiKeyModal({ isOpen, onClose }: GeminiKeyModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (res.ok) {
        setFeedback({ type: "success", message: "✅ API key saved!" });
        setApiKey("");
      } else {
        const data = await res.json();
        setFeedback({ type: "error", message: data.error ?? "Failed to save key." });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/gemini-key", { method: "DELETE" });
      if (res.ok) {
        setFeedback({ type: "success", message: "✅ API key removed." });
      } else {
        setFeedback({ type: "error", message: "Failed to remove key." });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-lg shadow-2xl w-full max-w-md p-6 relative"
        style={{ background: '#25262B', border: '1px solid #373A40' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 rounded p-1 transition-colors"
          style={{ color: '#909296' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#12B886'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#909296'; }}
          aria-label="Close modal"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-black uppercase tracking-widest mb-2" style={{ color: '#F8F9FA' }}>
          Set Gemini API Key
        </h2>
        <p className="text-sm mb-5" style={{ color: '#909296' }}>
          Your key is stored as a secure, HttpOnly cookie for 2 days and never logged.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <input
              ref={inputRef}
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Gemini API key"
              className="w-full rounded px-3 py-2 pr-16 text-sm focus:outline-none"
              style={{ background: '#1A1B1E', border: '1px solid #373A40', color: '#F8F9FA' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#12B886'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#373A40'; }}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold"
              style={{ color: '#909296' }}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>

          {feedback && (
            <p className={`text-sm font-medium ${feedback.type === "success" ? "text-green-400" : "text-red-400"}`}>
              {feedback.message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-bold text-sm rounded px-3 py-2 transition-colors disabled:opacity-50"
            style={{ background: '#4C6EF5', color: '#F8F9FA' }}
          >
            Save Key
          </button>
        </form>

        <button
          onClick={handleRemove}
          disabled={loading}
          className="mt-3 w-full font-semibold text-sm rounded px-3 py-2 transition-colors disabled:opacity-50"
          style={{ border: '1px solid #373A40', color: '#F8F9FA', background: 'transparent' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(18,184,134,0.15)'; e.currentTarget.style.color = '#12B886'; e.currentTarget.style.borderColor = '#12B886'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#F8F9FA'; e.currentTarget.style.borderColor = '#373A40'; }}
        >
          Remove Key
        </button>
      </div>
    </div>
  );
}
