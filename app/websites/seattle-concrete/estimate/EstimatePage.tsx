"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { MapMeasurement } from "./components/MapMeasurement";
import { PavingCalculator } from "./components/PavingCalculator";
import { PhotoMockup } from "./components/PhotoMockup";
import { ProposalExport } from "./components/ProposalExport";
import { PavingData, DEFAULT_DATA } from "./types";
import { motion, AnimatePresence } from "motion/react";
import { LayoutDashboard, Map as MapIcon, Image as ImageIcon, FileText, ChevronRight } from "lucide-react";

const STORAGE_KEY = "paveplan_data";

const steps = [
  { id: 1, name: "Measure", icon: MapIcon },
  { id: 2, name: "Mockup", icon: ImageIcon },
  { id: 3, name: "Proposal", icon: FileText },
];

export default function EstimatePage() {
  const [data, setData] = useState<PavingData>(() => {
    if (typeof window === "undefined") return DEFAULT_DATA;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_DATA;
    } catch {
      return DEFAULT_DATA;
    }
  });

  const [currentStep, setCurrentStep] = useState(1);

  const handleSave = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const updateData = (newData: Partial<PavingData>) => {
    setData((prev) => ({ ...prev, ...newData }));
  };

  // Auto-save on change (debounced)
  useEffect(() => {
    const timer = setTimeout(handleSave, 2000);
    return () => clearTimeout(timer);
  }, [data, handleSave]);

  const nextStep = () => setCurrentStep((p) => Math.min(p + 1, 3));
  const prevStep = () => setCurrentStep((p) => Math.max(p - 1, 1));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-brand-bg/30">
      <Header onSave={handleSave} />

      <div className="flex-1 flex overflow-hidden">
        {/* Wizard sidebar */}
        <aside className="w-[400px] shrink-0 bg-white border-r border-brand-primary/10 flex flex-col shadow-2xl z-20">
          {/* Step tabs */}
          <div className="px-6 py-4 bg-brand-bg/20 flex justify-between items-center border-b border-brand-primary/10">
            {steps.map((step) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex flex-col items-center gap-1 transition-all ${
                    isActive ? "text-brand-primary" : "text-brand-primary/30"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      isActive
                        ? "bg-brand-primary border-brand-primary text-white"
                        : isCompleted
                          ? "bg-brand-accent border-brand-accent text-white"
                          : "bg-white border-brand-primary/10"
                    }`}
                  >
                    {isCompleted ? <ChevronRight size={16} /> : <Icon size={14} />}
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-tighter">{step.name}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 ppp-scrollbar">
            <AnimatePresence mode="wait">
              {currentStep === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-brand-primary">1. Measure Area</h2>
                    <p className="text-xs text-brand-primary/60">
                      Use the map on the right to trace the area. The calculator updates automatically.
                    </p>
                  </div>
                  <PavingCalculator data={data} onChange={updateData} />
                  <div className="ppp-card p-4 bg-brand-primary text-white space-y-4">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                      <LayoutDashboard size={14} className="text-brand-accent" />
                      <h3 className="text-[10px] uppercase tracking-widest font-bold text-white/50">
                        Live Estimate
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[8px] uppercase tracking-widest font-bold text-white/40">Area</p>
                        <p className="text-lg font-mono font-bold">
                          {data.areaSqFt.toLocaleString()}{" "}
                          <span className="text-[10px] font-normal">SQFT</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-widest font-bold text-white/40">Tonnage</p>
                        <p className="text-lg font-mono font-bold text-brand-accent">
                          {data.tonnage.toLocaleString()}{" "}
                          <span className="text-[10px] font-normal">TONS</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={nextStep}
                    className="ppp-btn-accent w-full py-4 flex items-center justify-center gap-2 group shadow-lg shadow-brand-accent/20"
                  >
                    <span>Continue to Mockup</span>
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-brand-primary">2. Visual Mockup</h2>
                    <p className="text-xs text-brand-primary/60">
                      Upload a photo and use the brush tool to simulate new asphalt.
                    </p>
                  </div>
                  <div className="ppp-card p-4 space-y-4">
                    <div className="flex items-center gap-2 border-b border-brand-primary/10 pb-2">
                      <ImageIcon size={14} className="text-brand-accent" />
                      <h3 className="text-[10px] uppercase tracking-widest font-bold text-brand-primary/40">
                        Mockup Controls
                      </h3>
                    </div>
                    <p className="text-xs text-brand-primary/60 italic">
                      Use the paint and erase tools overlaying the image on the right.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={nextStep}
                      className="ppp-btn-accent w-full py-4 flex items-center justify-center gap-2 group shadow-lg shadow-brand-accent/20"
                    >
                      <span>Review Proposal</span>
                      <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button
                      onClick={prevStep}
                      className="text-xs font-bold text-brand-primary/40 hover:text-brand-primary transition-colors text-center"
                    >
                      Back to Measurement
                    </button>
                  </div>
                </motion.div>
              )}

              {currentStep === 3 && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-brand-primary">3. Final Proposal</h2>
                    <p className="text-xs text-brand-primary/60">
                      Review project details and download the PDF proposal.
                    </p>
                  </div>
                  <div className="ppp-card p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-brand-primary/10 pb-2">
                      <FileText size={14} className="text-brand-accent" />
                      <h3 className="text-[10px] uppercase tracking-widest font-bold text-brand-primary/40">
                        Project Summary
                      </h3>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="ppp-input-label">Project</label>
                        <p className="text-sm font-bold text-brand-primary">{data.projectName || "Untitled"}</p>
                      </div>
                      <div>
                        <label className="ppp-input-label">Client</label>
                        <p className="text-sm font-bold text-brand-primary">{data.clientName || "N/A"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="ppp-input-label">Area</label>
                          <p className="text-sm font-mono font-bold text-brand-primary">
                            {data.areaSqFt.toLocaleString()} SQFT
                          </p>
                        </div>
                        <div>
                          <label className="ppp-input-label">Tons</label>
                          <p className="text-sm font-mono font-bold text-brand-accent">
                            {data.tonnage.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <ProposalExport data={data} />
                  <button
                    onClick={prevStep}
                    className="w-full text-xs font-bold text-brand-primary/40 hover:text-brand-primary transition-colors text-center"
                  >
                    Go back and edit details
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>

        {/* Main visual content */}
        <main className="flex-1 relative overflow-hidden bg-brand-bg">
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div
                key="visual-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full w-full p-6"
              >
                <MapMeasurement
                  onAreaChange={(area) => updateData({ areaSqFt: area })}
                  onScreenshot={(url) => updateData({ mapScreenshot: url })}
                  initialArea={data.areaSqFt}
                />
              </motion.div>
            )}
            {currentStep === 2 && (
              <motion.div
                key="visual-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full w-full p-6"
              >
                <PhotoMockup
                  onMockupChange={(url) => updateData({ mockupImage: url })}
                  initialMockup={data.mockupImage}
                />
              </motion.div>
            )}
            {currentStep === 3 && (
              <motion.div
                key="visual-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full w-full p-8 overflow-y-auto flex items-center justify-center bg-brand-bg/50"
              >
                <div className="w-full max-w-4xl bg-white shadow-2xl rounded-2xl overflow-hidden border border-brand-primary/10">
                  <div className="p-12 space-y-8">
                    <div className="flex justify-between items-start border-b border-brand-primary/10 pb-8">
                      <div>
                        <h2 className="text-3xl font-bold text-brand-primary tracking-tight">
                          Project Proposal
                        </h2>
                        <p className="text-brand-primary/40 font-mono text-xs mt-1 uppercase tracking-widest">
                          Confidential Estimate
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary/40">
                          Project ID
                        </p>
                        <p className="font-mono text-sm font-bold">
                          #{Math.random().toString(36).substr(2, 9).toUpperCase()}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-12">
                      <div className="space-y-6">
                        <div className="space-y-1">
                          <label className="ppp-input-label">Project Name</label>
                          <p className="text-xl font-bold text-brand-primary">
                            {data.projectName || "Untitled Project"}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <label className="ppp-input-label">Site Address</label>
                          <p className="text-sm text-brand-primary/60 leading-relaxed">
                            {data.address || "No address provided"}
                          </p>
                        </div>
                        <div className="pt-6 border-t border-brand-primary/5 grid grid-cols-2 gap-4">
                          <div>
                            <label className="ppp-input-label">Total Area</label>
                            <p className="text-lg font-mono font-bold text-brand-primary">
                              {data.areaSqFt.toLocaleString()} SQFT
                            </p>
                          </div>
                          <div>
                            <label className="ppp-input-label">Est. Tonnage</label>
                            <p className="text-lg font-mono font-bold text-brand-accent">
                              {data.tonnage.toLocaleString()} TONS
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="ppp-input-label">Visual Mockup Preview</label>
                        {data.mockupImage ? (
                          <div className="aspect-video rounded-xl overflow-hidden border border-brand-primary/10 shadow-inner bg-brand-bg/20">
                            <img
                              src={data.mockupImage}
                              alt="Mockup"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video rounded-xl bg-brand-bg/50 flex flex-col items-center justify-center border border-dashed border-brand-primary/10">
                            <ImageIcon size={32} className="text-brand-primary/10 mb-2" />
                            <p className="text-[10px] text-brand-primary/40 italic uppercase tracking-widest">
                              No mockup created
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
