"use client";

import { useEffect, useState } from "react";

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export default function CopyPageHandler() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);
      const triggered = isMac ? e.metaKey && e.key === "a" : e.ctrlKey && e.key === "a";
      if (!triggered) return;
      if (isEditableTarget(document.activeElement)) return;

      e.preventDefault();

      const title = document.title;
      const metaDesc =
        document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
      const mainEl = document.getElementById("main-content");
      const rawText = mainEl ? (mainEl as HTMLElement).innerText : "";

      // Collapse runs of blank lines to a single blank line
      const body = rawText
        .split("\n")
        .map((l) => l.trimEnd())
        .reduce((acc: string[], line) => {
          if (line === "" && acc.length > 0 && acc[acc.length - 1] === "") return acc;
          acc.push(line);
          return acc;
        }, [])
        .join("\n")
        .trim();

      const parts = [`# ${title}`];
      if (metaDesc) parts.push(`> ${metaDesc}`);
      parts.push("---");
      if (body) parts.push(body);

      navigator.clipboard.writeText(parts.join("\n\n")).then(() => {
        setVisible(true);
        setTimeout(() => setVisible(false), 2000);
      });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!visible) return null;

  return (
    <div className='fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-slate-100 px-4 py-2 rounded-lg shadow-lg text-sm pointer-events-none'>
      Page copied as markdown
    </div>
  );
}
