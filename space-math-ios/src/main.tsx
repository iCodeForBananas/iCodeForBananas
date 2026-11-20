import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import SpaceMathApp from "./SpaceMathApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SpaceMathApp />
  </StrictMode>,
);
