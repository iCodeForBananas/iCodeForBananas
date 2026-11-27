import { afterEach, describe, expect, it, vi } from "vitest";
import { toolFromPath, track } from "./analytics";

describe("toolFromPath", () => {
  it("returns the first segment for tool pages", () => {
    expect(toolFromPath("/songwriter/abc/edit")).toBe("songwriter");
    expect(toolFromPath("/fretboard-quiz")).toBe("fretboard-quiz");
  });
  it("skips home and non-tool pages", () => {
    expect(toolFromPath("/")).toBeNull();
    expect(toolFromPath("/login")).toBeNull();
    expect(toolFromPath("/register")).toBeNull();
    expect(toolFromPath("/settings")).toBeNull();
  });
});

describe("track", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls gtag when it is loaded", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    track("login", { method: "password" });
    expect(gtag).toHaveBeenCalledWith("event", "login", { method: "password" });
  });

  it("queues an Arguments object on dataLayer before gtag loads", () => {
    const win: { dataLayer?: unknown[] } = {};
    vi.stubGlobal("window", win);
    track("song_create");
    expect(win.dataLayer).toHaveLength(1);
    const entry = win.dataLayer![0] as IArguments;
    expect(Object.prototype.toString.call(entry)).toBe("[object Arguments]");
    expect(Array.from(entry)).toEqual(["event", "song_create", {}]);
  });

  it("is a no-op on the server", () => {
    expect(() => track("x")).not.toThrow();
  });
});
