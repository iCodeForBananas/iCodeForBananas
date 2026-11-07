// US/Eastern wall-clock helpers. Tradier timestamps are Eastern without an
// offset; everything internal is UTC epoch ms.

const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface EtParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function etParts(ms: number): EtParts {
  const p = Object.fromEntries(etFormatter.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-06" in US/Eastern. */
export function etDate(ms: number): string {
  const p = etParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "2026-11-06 09:30" in US/Eastern, the format timesales takes. */
export function etStamp(ms: number): string {
  const p = etParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

export function etMinutesOfDay(ms: number): number {
  const p = etParts(ms);
  return p.hour * 60 + p.minute;
}

/** UTC epoch ms of a US/Eastern wall-clock time. */
export function etWallToUtcMs(year: number, month: number, day: number, hour: number, minute: number, second = 0): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = asUtc;
  for (let k = 0; k < 3; k++) {
    const p = etParts(guess);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const next = guess + (asUtc - shown);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** "2026-11-05T09:30:00" in US/Eastern -> UTC epoch ms, NaN when malformed. */
export function parseEtTimestamp(s: unknown): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(s));
  if (!m) return NaN;
  return etWallToUtcMs(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

/** A bar that closed in [09:30, 16:00) ET is a regular-session bar. */
export function isRegularSessionClose(closeMs: number): boolean {
  const min = etMinutesOfDay(closeMs);
  return min >= 9 * 60 + 30 && min < 16 * 60;
}
