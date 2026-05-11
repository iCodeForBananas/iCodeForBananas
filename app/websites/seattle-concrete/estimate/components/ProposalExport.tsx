"use client";

import React, { useState } from "react";
import { jsPDF } from "jspdf";
import { FileText, Download, CheckCircle2, Loader2 } from "lucide-react";
import { PavingData } from "../types";

interface ProposalExportProps {
  data: PavingData;
}

export const ProposalExport: React.FC<ProposalExportProps> = ({ data }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let yPos = 20;

      // Header band
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, pageWidth, 40, "F");
      doc.setTextColor(242, 125, 38);
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("PAVEPLAN PRO", margin, 25);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("courier", "normal");
      doc.text("PRECISION ESTIMATION SUITE", margin, 32);
      yPos = 55;

      // Project info
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("JOB PROPOSAL", margin, yPos);
      yPos += 10;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Project: ${data.projectName}`, margin, yPos); yPos += 5;
      doc.text(`Client: ${data.clientName}`, margin, yPos);   yPos += 5;
      doc.text(`Address: ${data.address}`, margin, yPos);     yPos += 5;
      doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPos); yPos += 15;

      // Calculations table
      doc.setFillColor(245, 245, 240);
      doc.rect(margin, yPos, contentWidth, 40, "F");
      doc.setFont("helvetica", "bold");
      doc.text("ESTIMATED TOTALS", margin + 5, yPos + 10);
      doc.setFont("helvetica", "normal");
      yPos += 20;
      doc.text("Measured Area:", margin + 5, yPos);
      doc.text(`${data.areaSqFt.toLocaleString()} SQ FT`, margin + 60, yPos); yPos += 7;
      doc.text("Material Depth:", margin + 5, yPos);
      doc.text(`${data.depthInches} INCHES`, margin + 60, yPos); yPos += 7;
      doc.text("Material Type:", margin + 5, yPos);
      doc.text(`${data.materialType}`, margin + 60, yPos); yPos += 15;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL TONNAGE:", margin, yPos);
      doc.setTextColor(242, 125, 38);
      doc.text(`${data.tonnage.toLocaleString()} TONS`, margin + 60, yPos);
      yPos += 20;

      // Mockup image
      if (data.mockupImage) {
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("VISUAL MOCKUP", margin, yPos);
        yPos += 5;
        const imgProps = doc.getImageProperties(data.mockupImage);
        const imgHeight = (imgProps.height * contentWidth) / imgProps.width;
        if (yPos + imgHeight > 280) { doc.addPage(); yPos = 20; }
        doc.addImage(data.mockupImage, "PNG", margin, yPos, contentWidth, imgHeight);
      }

      doc.save(`Proposal_${data.projectName.replace(/\s+/g, "_")}.pdf`);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="ppp-card p-6 flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b border-brand-primary/10 pb-4">
        <FileText size={20} className="text-brand-accent" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-brand-primary">
          Export Proposal
        </h2>
      </div>
      <p className="text-sm text-brand-primary/60 leading-relaxed">
        Generate a professional PDF proposal including project details, calculated tonnage, and the
        visual mockup.
      </p>
      <button
        onClick={generatePDF}
        disabled={isGenerating}
        className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold transition-all active:scale-95 ${
          isSuccess
            ? "bg-green-500 text-white"
            : "bg-brand-primary text-white hover:bg-brand-primary/90"
        }`}
      >
        {isGenerating ? (
          <Loader2 size={20} className="animate-spin" />
        ) : isSuccess ? (
          <CheckCircle2 size={20} />
        ) : (
          <Download size={20} />
        )}
        <span>
          {isGenerating ? "Generating PDF…" : isSuccess ? "Proposal Downloaded" : "Download PDF Proposal"}
        </span>
      </button>
    </div>
  );
};
