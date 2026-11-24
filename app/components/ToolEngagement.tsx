"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toolFromPath, track } from "@/app/lib/analytics";

/**
 * Sends `tool_engaged` the first time someone clicks, taps or types on a tool
 * page, once per visit to that path. Page views already cover "opened the
 * tool"; this is the next funnel step, "actually used it".
 */
export default function ToolEngagement() {
  const pathname = usePathname();

  useEffect(() => {
    const tool = toolFromPath(pathname);
    if (!tool) return;
    const onFirst = () => {
      track("tool_engaged", { tool, page_path: pathname });
      remove();
    };
    const remove = () => {
      window.removeEventListener("pointerdown", onFirst, true);
      window.removeEventListener("keydown", onFirst, true);
    };
    window.addEventListener("pointerdown", onFirst, true);
    window.addEventListener("keydown", onFirst, true);
    return remove;
  }, [pathname]);

  return null;
}
