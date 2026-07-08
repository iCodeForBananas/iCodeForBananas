"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

// ── Public API ────────────────────────────────────────────────────────────────

export interface BentoPanel {
  id: string;
  title: string;
  tooltip?: string;
  content: ReactNode;
  /** Initial width, in grid columns (1–12). */
  defaultColSpan: number;
  /** Initial height, in grid rows (each ROW_PX tall). */
  defaultRowSpan: number;
}

interface PanelLayout {
  id: string;
  colSpan: number;
  rowSpan: number;
}

// ── Grid constants ──────────────────────────────────────────────────────────--

const COLS = 12;
const ROW_PX = 110;
const GAP_PX = 16;
const MIN_COL = 3;
const MIN_ROW = 2;
const MAX_ROW = 14;
const NARROW_BREAKPOINT = 760;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ── Layout persistence ────────────────────────────────────────────────────────

const defaultLayout = (panels: BentoPanel[]): PanelLayout[] =>
  panels.map((p) => ({ id: p.id, colSpan: p.defaultColSpan, rowSpan: p.defaultRowSpan }));

const reconcile = (saved: PanelLayout[], panels: BentoPanel[]): PanelLayout[] => {
  const savedIds = new Set(saved.map((s) => s.id));
  const result: PanelLayout[] = [];

  // Keep the user's saved order for panels that still exist.
  for (const s of saved) {
    const panel = panels.find((p) => p.id === s.id);
    if (!panel) continue;
    result.push({
      id: s.id,
      colSpan: clamp(s.colSpan, MIN_COL, COLS),
      rowSpan: clamp(s.rowSpan, MIN_ROW, MAX_ROW),
    });
  }
  // Append any newly-added panels at the end with their defaults.
  for (const p of panels) {
    if (!savedIds.has(p.id)) {
      result.push({ id: p.id, colSpan: p.defaultColSpan, rowSpan: p.defaultRowSpan });
    }
  }
  return result;
};

const readLayout = (storageKey: string): PanelLayout[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (p) => p && typeof p.id === "string" && typeof p.colSpan === "number" && typeof p.rowSpan === "number"
    );
  } catch {
    return null;
  }
};

// ── Card chrome (shared by grid + stacked layouts) ─────────────────────────────

function PanelShell({
  title,
  tooltip,
  children,
  dragHandle,
  resizeHandle,
}: {
  title: string;
  tooltip?: string;
  children: ReactNode;
  dragHandle?: ReactNode;
  resizeHandle?: ReactNode;
}) {
  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white dark:bg-neutral-900"
      style={{ border: "1px solid var(--border-color)" }}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--border-color)" }}
      >
        {dragHandle}
        <h3
          className={`text-xs font-bold uppercase tracking-wide text-black/70 dark:text-yellow-400/70${tooltip ? " cursor-help" : ""}`}
          title={tooltip}
        >
          {title}
        </h3>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      {resizeHandle}
    </div>
  );
}

// ── Sortable + resizable grid panel ────────────────────────────────────────────

function GridPanel({
  panel,
  layout,
  colUnit,
  onResize,
}: {
  panel: BentoPanel;
  layout: PanelLayout;
  colUnit: number;
  onResize: (id: string, colSpan: number, rowSpan: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: panel.id,
  });

  const style: CSSProperties = {
    gridColumn: `span ${layout.colSpan}`,
    gridRow: `span ${layout.rowSpan}`,
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startCol = layout.colSpan;
    const startRow = layout.rowSpan;
    const rowUnit = ROW_PX + GAP_PX;

    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";

    const move = (ev: PointerEvent) => {
      const dCol = Math.round((ev.clientX - startX) / colUnit);
      const dRow = Math.round((ev.clientY - startY) / rowUnit);
      onResize(
        panel.id,
        clamp(startCol + dCol, MIN_COL, COLS),
        clamp(startRow + dRow, MIN_ROW, MAX_ROW)
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={setNodeRef} style={style}>
      <PanelShell
        title={panel.title}
        tooltip={panel.tooltip}
        dragHandle={
          <button
            type="button"
            className="-ml-1 cursor-grab touch-none rounded p-1 text-black/30 hover:text-black/60 active:cursor-grabbing dark:text-white/30 dark:hover:text-white/60"
            title="Drag to rearrange this panel"
            aria-label={`Drag to move ${panel.title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        }
        resizeHandle={
          <div
            onPointerDown={startResize}
            title="Drag to resize this panel"
            aria-label={`Resize ${panel.title}`}
            className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none text-black/25 hover:text-black/60 dark:text-white/25 dark:hover:text-white/60"
          >
            <svg viewBox="0 0 20 20" className="h-full w-full">
              <path d="M19 7 L7 19 M19 12 L12 19 M19 17 L17 19" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        }
      >
        {panel.content}
      </PanelShell>
    </div>
  );
}

// ── Board ──────────────────────────────────────────────────────────────────────

export default function BentoBoard({
  panels,
  storageKey,
}: {
  panels: BentoPanel[];
  storageKey: string;
}) {
  const [layout, setLayout] = useState<PanelLayout[]>(() => defaultLayout(panels));
  const [loaded, setLoaded] = useState(false);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Restore saved layout after mount (keeps SSR + first client paint identical).
  useEffect(() => {
    const saved = readLayout(storageKey);
    setLayout(reconcile(saved ?? defaultLayout(panels), panels));
    setLoaded(true);
    // panels identity changes per render but ids/defaults are stable for a given page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist whenever the layout changes (after the initial load).
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [layout, loaded, storageKey]);

  // Track container width to drive responsiveness + resize math.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayout((prev) => {
      const from = prev.findIndex((p) => p.id === active.id);
      const to = prev.findIndex((p) => p.id === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  };

  const handleResize = useCallback((id: string, colSpan: number, rowSpan: number) => {
    setLayout((prev) =>
      prev.map((p) => (p.id === id ? { ...p, colSpan, rowSpan } : p))
    );
  }, []);

  const resetLayout = () => setLayout(defaultLayout(panels));

  const narrow = width > 0 && width < NARROW_BREAKPOINT;
  const colUnit = width > 0 ? (width - (COLS - 1) * GAP_PX) / COLS + GAP_PX : 96;

  const orderedPanels = layout
    .map((l) => ({ layout: l, panel: panels.find((p) => p.id === l.id) }))
    .filter((x): x is { layout: PanelLayout; panel: BentoPanel } => Boolean(x.panel));

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {!narrow && (
        <div className="flex items-center justify-end gap-3 text-xs text-black/40 dark:text-white/40">
          <span className="hidden sm:inline">Drag the ⠿ handle to rearrange · drag a corner to resize</span>
          <button
            type="button"
            onClick={resetLayout}
            className="rounded-md border border-border px-2.5 py-1 font-medium transition-colors hover:bg-foreground/10"
            title="Restore the default panel arrangement"
          >
            Reset layout
          </button>
        </div>
      )}

      {narrow ? (
        // Stacked, full-width panels on small screens — drag/resize disabled.
        <div className="flex flex-col gap-4">
          {orderedPanels.map(({ panel }) => (
            <div key={panel.id} className="min-h-[200px]">
              <PanelShell title={panel.title} tooltip={panel.tooltip}>
                {panel.content}
              </PanelShell>
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={layout.map((l) => l.id)} strategy={rectSortingStrategy}>
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                gridAutoRows: `${ROW_PX}px`,
                gridAutoFlow: "row dense",
                gap: `${GAP_PX}px`,
              }}
            >
              {orderedPanels.map(({ panel, layout: l }) => (
                <GridPanel
                  key={panel.id}
                  panel={panel}
                  layout={l}
                  colUnit={colUnit}
                  onResize={handleResize}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
