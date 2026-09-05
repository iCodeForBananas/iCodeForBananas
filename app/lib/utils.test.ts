import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("lets a later utility win within a group", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
    expect(cn("text-ink-muted", "text-ink-primary")).toBe("text-ink-primary");
    expect(cn("text-13", "text-17")).toBe("text-17");
    expect(cn("shadow-raised", "shadow-overlay")).toBe("shadow-overlay");
  });

  /**
   * The type scale is named by pixel size, so a size and a colour both look
   * like `text-<something>`. Left to itself the merger files them together and
   * keeps one, which on the primary button deleted the near-black label and
   * left near-white text on amber at about 1.4:1. Nothing about that failure is
   * visible in the source, so it is pinned here.
   */
  it("does not let a font size and a text colour cancel each other out", () => {
    expect(cn("text-ink-on-primary text-13")).toBe("text-ink-on-primary text-13");
    expect(cn("text-13 text-ink-on-primary")).toBe("text-13 text-ink-on-primary");
    for (const step of ["10", "12", "13", "15", "16", "17", "20", "24", "32", "48"]) {
      expect(cn(`text-ink-muted text-${step}`)).toBe(`text-ink-muted text-${step}`);
    }
  });

  it("keeps the focus ring's three parts, which are three properties", () => {
    const ring = "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-focus";
    expect(cn(ring)).toBe(ring);
  });

  it("takes the shapes clsx takes", () => {
    expect(cn("a", false && "b", ["c", { d: true, e: false }])).toBe("a c d");
  });
});
