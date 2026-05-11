"use client";

import React from "react";
import { PavingData, MATERIALS } from "../types";
import { Calculator, Info } from "lucide-react";

interface PavingCalculatorProps {
  data: PavingData;
  onChange: (data: Partial<PavingData>) => void;
}

export const PavingCalculator: React.FC<PavingCalculatorProps> = ({ data, onChange }) => {
  const calculateTonnage = (area: number, depth: number, density: number) => {
    const cubicFeet = area * (depth / 12);
    const lbs = cubicFeet * density;
    return Number((lbs / 2000).toFixed(2));
  };

  const handleInputChange = (field: keyof PavingData, value: string | number) => {
    const newData = { ...data, [field]: value };
    if (["areaSqFt", "depthInches", "density"].includes(field as string)) {
      newData.tonnage = calculateTonnage(
        field === "areaSqFt" ? Number(value) : data.areaSqFt,
        field === "depthInches" ? Number(value) : data.depthInches,
        field === "density" ? Number(value) : data.density,
      );
    }
    onChange(newData);
  };

  const handleMaterialChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const material = MATERIALS.find((m) => m.name === e.target.value);
    if (material) {
      const newData = {
        ...data,
        materialType: material.name,
        density: material.density,
        tonnage: calculateTonnage(data.areaSqFt, data.depthInches, material.density),
      };
      onChange(newData);
    }
  };

  return (
    <div className="ppp-card p-6 flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b border-brand-primary/10 pb-4">
        <Calculator size={20} className="text-brand-accent" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-brand-primary">
          Paving Calculator
        </h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="ppp-input-label">Project Name</label>
          <input
            type="text"
            value={data.projectName}
            onChange={(e) => handleInputChange("projectName", e.target.value)}
            className="ppp-input-field"
            placeholder="e.g. Smith Driveway"
          />
        </div>
        <div>
          <label className="ppp-input-label">Client Name</label>
          <input
            type="text"
            value={data.clientName}
            onChange={(e) => handleInputChange("clientName", e.target.value)}
            className="ppp-input-field"
            placeholder="e.g. John Smith"
          />
        </div>
        <div>
          <label className="ppp-input-label">Project Address</label>
          <input
            type="text"
            value={data.address}
            onChange={(e) => handleInputChange("address", e.target.value)}
            className="ppp-input-field"
            placeholder="123 Paving Lane, Tacoma WA"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="ppp-input-label">Area (Sq Ft)</label>
            <input
              type="number"
              value={data.areaSqFt}
              onChange={(e) => handleInputChange("areaSqFt", Number(e.target.value))}
              className="ppp-input-field font-mono"
            />
          </div>
          <div>
            <label className="ppp-input-label">Depth (Inches)</label>
            <input
              type="number"
              value={data.depthInches}
              onChange={(e) => handleInputChange("depthInches", Number(e.target.value))}
              className="ppp-input-field font-mono"
            />
          </div>
        </div>
        <div>
          <label className="ppp-input-label">Material Type</label>
          <select value={data.materialType} onChange={handleMaterialChange} className="ppp-input-field">
            {MATERIALS.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="p-4 bg-brand-primary text-white rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">
              Total Tonnage
            </p>
            <p className="text-3xl font-mono font-bold">{data.tonnage.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">Material</p>
            <p className="text-sm font-medium">{data.materialType}</p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 bg-brand-bg/50 rounded-lg border border-brand-primary/5">
        <Info size={14} className="text-brand-accent mt-0.5 shrink-0" />
        <p className="text-[10px] text-brand-primary/60 leading-relaxed">
          Based on standard densities:
          {MATERIALS.map((m) => ` ${m.name} (${m.density} lbs/ft³)`).join(",")}. Confirm
          with your supplier for specific batch densities.
        </p>
      </div>
    </div>
  );
};
