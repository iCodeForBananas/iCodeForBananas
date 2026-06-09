import type { Metadata } from "next";
import MermaidFlowPage from "./MermaidFlowPage";

export const metadata: Metadata = {
  title: "Mermaid Flow",
  description: "Mermaid diagram editor with live preview. Create flowcharts, sequence diagrams, Gantt charts, and class diagrams. Export as PNG or share your diagram with a link.",
  keywords: ["Mermaid diagrams", "flowchart editor", "sequence diagrams", "diagram tool", "developer tools", "diagramming", "Mermaid.js", "Gantt chart"],
  openGraph: {
    title: "Mermaid Flow",
    description: "Live Mermaid diagram editor — create, preview, export, and share diagrams.",
    type: "website",
  },
};

export default MermaidFlowPage;
