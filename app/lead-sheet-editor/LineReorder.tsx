"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { ChordLyricLine } from "./shared";

// ─── Dragging lines around ────────────────────────────────────────────────────
//
// Edit mode gives every line a grip. Dragging one reorders the section it's in,
// or drops it into another section entirely — a chorus line that belongs in the
// bridge moves there rather than being retyped.
//
// Nothing is written until the drag ends: the sheet is the source of truth
// throughout, and the drop hands the parent one move to save.

/** Where a line lives — which section, and which line inside it. */
export interface LinePos {
  sectionIndex: number;
  lineIndex: number;
}

/** Sortable ids carry the position, so a drop knows both ends without a lookup. */
export const lineDragId = (sectionIndex: number, lineIndex: number) =>
  `line:${sectionIndex}:${lineIndex}`;

function parseDragId(id: string | number): LinePos | null {
  const m = String(id).match(/^line:(\d+):(\d+)$/);
  return m ? { sectionIndex: Number(m[1]), lineIndex: Number(m[2]) } : null;
}

/**
 * One draggable line: a grip, and the row itself beside it. The grip is its own
 * button so a tap on the line still opens the editor — only the grip drags,
 * which is the only way this works on a phone.
 */
export function SortableLine({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-start gap-1 rounded ${isDragging ? "opacity-40" : ""} ${
        isOver && !isDragging ? "ring-2 ring-yellow-400" : ""
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        // Without this a drag off the grip scrolls the page instead.
        style={{ touchAction: "none" }}
        aria-label='Drag to move this line'
        title='Drag to move this line'
        className='mt-0.5 flex h-9 w-7 shrink-0 cursor-grab items-center justify-center rounded text-black/25 transition-colors duration-150 hover:bg-black/5 hover:text-black/60 active:cursor-grabbing dark:text-white/25 dark:hover:bg-white/10 dark:hover:text-white/60'
      >
        <GripVertical className='h-4 w-4' />
      </button>
      <div className='min-w-0 flex-1'>{children}</div>
    </div>
  );
}

/** The lines of one section, as one sortable list. */
export function SortableLines({
  enabled,
  sectionIndex,
  count,
  children,
}: {
  enabled: boolean;
  sectionIndex: number;
  count: number;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <SortableContext
      items={Array.from({ length: count }, (_, i) => lineDragId(sectionIndex, i))}
      strategy={verticalListSortingStrategy}
    >
      {children}
    </SortableContext>
  );
}

/**
 * Wraps the whole song so a line can be dragged out of one section and into
 * another. `onMove` is called once, on drop, with where the line came from and
 * where it landed.
 */
export function LineDndProvider({
  onMove,
  lineTextAt,
  children,
}: {
  /** Absent outside edit mode, which leaves the sheet as plain markup. */
  onMove?: (from: LinePos, to: LinePos) => void;
  /** The line's text, for the card that follows the finger. */
  lineTextAt: (pos: LinePos) => string;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState<LinePos | null>(null);
  const sensors = useSensors(
    // Far enough that a tap on the grip is still a tap, short enough that a
    // deliberate drag starts immediately.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleStart = (e: DragStartEvent) => setDragging(parseDragId(e.active.id));

  const handleEnd = (e: DragEndEvent) => {
    setDragging(null);
    const from = parseDragId(e.active.id);
    const over = e.over ? parseDragId(e.over.id) : null;
    if (!onMove || !from || !over) return;
    if (from.sectionIndex === over.sectionIndex) {
      if (from.lineIndex === over.lineIndex) return;
      onMove(from, over);
      return;
    }
    // Landing in another section: past the middle of the line it's over means
    // below it, which is the only way to reach the end of another section.
    const activeRect = e.active.rect.current.translated;
    const overRect = e.over!.rect;
    const below =
      !!activeRect &&
      activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2;
    onMove(from, { ...over, lineIndex: over.lineIndex + (below ? 1 : 0) });
  };

  if (!onMove) return <>{children}</>;

  return (
    <DndContext
      // A fixed id keeps dnd-kit's generated aria ids the same on the server
      // and the client, which is otherwise a hydration mismatch waiting for
      // the first page that renders with edit mode already on.
      id='lead-sheet-lines'
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      onDragCancel={() => setDragging(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className='flex items-center gap-1 rounded-lg border-2 border-yellow-400 bg-white px-2 py-1.5 shadow-xl dark:bg-neutral-900'>
            <GripVertical className='h-4 w-4 shrink-0 text-black/30 dark:text-white/30' />
            <div className='min-w-0'>
              <ChordLyricLine line={lineTextAt(dragging)} />
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
