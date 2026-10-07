import { afterEach, describe, expect, it } from "vitest";
import { readPanelOpen, writePanelOpen } from "./panelStorage";

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

/** Only `localStorage` matters to the module under test; the cast narrows
 *  the rest of `Window` away rather than stubbing every member of it. */
function setFakeWindow(localStorage: Storage): void {
  globalThis.window = { localStorage } as unknown as Window & typeof globalThis;
}

describe("panel open storage", () => {
  afterEach(() => {
    // @ts-expect-error -- not present in the node test environment to begin with
    delete globalThis.window;
  });

  it("reports unset when nothing has ever been written", () => {
    setFakeWindow(fakeStorage());
    expect(readPanelOpen("library")).toBeNull();
    expect(readPanelOpen("drums")).toBeNull();
  });

  it("round-trips each panel under its own key", () => {
    setFakeWindow(fakeStorage());
    writePanelOpen("library", true);
    writePanelOpen("drums", false);
    expect(readPanelOpen("library")).toBe(true);
    expect(readPanelOpen("drums")).toBe(false);
  });

  it("namespaces the two keys so they cannot collide with each other or anything else", () => {
    const backing = fakeStorage();
    setFakeWindow(backing);
    writePanelOpen("library", true);
    writePanelOpen("drums", true);
    expect(backing.key(0)).not.toBe(backing.key(1));
    expect(backing.getItem("leadsheet:panel:library")).toBe("1");
    expect(backing.getItem("leadsheet:panel:drums")).toBe("1");
  });

  it("reports unset rather than throwing when window is unavailable (SSR)", () => {
    expect(() => readPanelOpen("library")).not.toThrow();
    expect(readPanelOpen("library")).toBeNull();
    expect(() => writePanelOpen("library", true)).not.toThrow();
  });

  it("reports unset rather than throwing when storage access itself throws", () => {
    setFakeWindow({
      ...fakeStorage(),
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    expect(readPanelOpen("library")).toBeNull();
    expect(() => writePanelOpen("library", true)).not.toThrow();
  });

  it("treats garbage values as unset rather than guessing", () => {
    const backing = fakeStorage();
    backing.setItem("leadsheet:panel:library", "yes");
    setFakeWindow(backing);
    expect(readPanelOpen("library")).toBeNull();
  });
});
