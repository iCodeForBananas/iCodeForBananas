"use client";

import React from "react";
import { HardHat, Save } from "lucide-react";

interface HeaderProps {
  onSave: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onSave }) => {
  return (
    <header className="bg-white border-b border-brand-primary/10 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-primary rounded-lg flex items-center justify-center text-brand-accent">
          <HardHat size={24} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-brand-primary leading-none">
            PAVEPLAN <span className="text-brand-accent">PRO</span>
          </h1>
          <p className="text-[10px] font-mono uppercase tracking-widest text-brand-primary/40 mt-1">
            Precision Estimation Suite
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg font-medium hover:bg-brand-primary/90 transition-all active:scale-95"
        >
          <Save size={18} />
          <span>Save Now</span>
        </button>
      </div>
    </header>
  );
};
