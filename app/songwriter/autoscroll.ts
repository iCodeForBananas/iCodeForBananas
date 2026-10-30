// ─── Autoscroll ──────────────────────────────────────────────────────────────
//
// The single most common way a lead sheet app fails on stage is that its
// autoscroll advances a line at a time. The fix is not subtle: move by a
// fraction of a pixel per frame and never round.
//
// Two rules keep it smooth, and both are about not reading scrollTop back.
//
//   The position is kept here as a float, and the fraction is applied as a
//   transform rather than through scrollTop. That is not a stylistic choice:
//   scrollTop does not hold a fraction at all. Chromium rounds it on the way
//   in, so scrollTop = 10.5 paints at 11 and scrollTop = 10.25 paints at 10,
//   at any device pixel ratio. A transform keeps 10.25 as 10.25. So the whole
//   pixels go to the scroll offset, which keeps the scrollbar honest and lets
//   a person scroll by hand, and the fraction goes to the transform.
//
//   The step comes from the frame's own elapsed time, not a fixed amount per
//   frame. A dropped frame then costs nothing, and the speed means the same
//   thing on a 60Hz laptop and a 120Hz phone.

/** How fast the page moves, in CSS pixels per second. */
export const MIN_SPEED = 4;
export const MAX_SPEED = 120;
export const DEFAULT_SPEED = 18;

/** The steps the speed control moves in. Fine at the bottom, coarse at the top. */
export function nudgeSpeed(speed: number, direction: 1 | -1): number {
  const step = speed < 20 ? 1 : speed < 60 ? 2 : 5;
  return clampSpeed(speed + step * direction);
}

export const clampSpeed = (speed: number): number =>
  Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(speed)));

/**
 * Where the scroll should be after one frame.
 *
 * `elapsedMs` is the real time since the last frame. A frame that took too long
 * is capped rather than jumped through: a tab that was backgrounded for a
 * minute should resume, not fling the song to the end.
 */
export function advance(
  position: number,
  speed: number,
  elapsedMs: number,
  max: number
): number {
  const dt = Math.min(Math.max(elapsedMs, 0), 100);
  return Math.min(max, position + (speed * dt) / 1000);
}

/**
 * Split a position into the part scrollTop can carry and the part it cannot.
 * The remainder is always positive so the transform only ever moves content
 * up, which keeps it in step with the direction of travel.
 */
export function split(position: number): { whole: number; fraction: number } {
  const whole = Math.floor(position);
  return { whole, fraction: position - whole };
}

/** Has the scroll run out of song? */
export const atEnd = (position: number, max: number): boolean => position >= max - 0.5;

// ─── Per-song speed ──────────────────────────────────────────────────────────

const storageKey = (songId: string) => `leadsheet:scroll-speed:${songId}`;

/**
 * Speed is remembered per song, because it is a property of the song rather
 * than a preference: a ballad and a fast one do not scroll at the same rate,
 * and having to reset it every time is what makes people stop using autoscroll.
 */
export function loadSpeed(songId: string): number {
  try {
    const stored = window.localStorage.getItem(storageKey(songId));
    if (stored === null) return DEFAULT_SPEED;
    const parsed = Number.parseFloat(stored);
    return Number.isFinite(parsed) ? clampSpeed(parsed) : DEFAULT_SPEED;
  } catch {
    // Private browsing, or storage turned off. Not worth failing a gig over.
    return DEFAULT_SPEED;
  }
}

export function saveSpeed(songId: string, speed: number): void {
  try {
    window.localStorage.setItem(storageKey(songId), String(clampSpeed(speed)));
  } catch {
    // Same.
  }
}
