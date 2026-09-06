"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-sunken/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-line-subtle bg-surface-overlay p-6 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="absolute top-3 right-3"
          aria-label="Close modal"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>

        <h2 className="mb-2 font-display text-20 font-semibold text-ink-primary">Set Gemini API Key</h2>
        <p className="mb-5 text-13 text-ink-muted">
          Your key is stored as a secure, HttpOnly cookie for 2 days and never logged.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <Input
              ref={inputRef}
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Gemini API key"
              className="h-10 pr-16"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-12 font-medium text-ink-muted hover:text-ink-primary"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>

          {feedback && (
            <p
              role="status"
              className={`text-13 font-medium ${feedback.type === "success" ? "text-success" : "text-danger"}`}
            >
              {feedback.message}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={loading} className="w-full">
            Save Key
          </Button>
        </form>

        <Button
          variant="danger"
          onClick={handleRemove}
          disabled={loading}
          className="mt-3 w-full"
        >
          Remove Key
        </Button>
      </div>
    </div>
  );
}
