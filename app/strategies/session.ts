// US equity session clock for intraday strategies.
// Bars carry UTC milliseconds. A strategy that trades the regular session
// (9:30 to 16:00 New York) needs each bar's New York date, its minute of the
// day, its place in the session, and the bar length, all worked out from that
// bar and the ones before it, never the ones after.

import { OHLCBar } from './types';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SESSION_OPEN = 9 * 60 + 30;
export const SESSION_CLOSE = 16 * 60;

/** UTC ms of the nth Sunday (1-based) of a month at a given UTC hour. */
function nthSunday(year: number, month: number, n: number, utcHour: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const day = 1 + ((7 - first) % 7) + (n - 1) * 7;
  return Date.UTC(year, month, day, utcHour);
}

/** Hours New York is behind UTC at this instant: 4 in daylight time, 5 otherwise. */
export function nyOffsetHours(time: number): number {
  const year = new Date(time).getUTCFullYear();
  // Since 2007: 2:00 local on the second Sunday of March to 2:00 local on the first Sunday of November.
  const start = nthSunday(year, 2, 2, 7);
  const end = nthSunday(year, 10, 1, 6);
  return time >= start && time < end ? 4 : 5;
}

/** A bar's New York date (days since the epoch) and minute of the day. */
export function nyClock(time: number): { day: number; minute: number } {
  const local = time - nyOffsetHours(time) * HOUR;
  const day = Math.floor(local / DAY);
  return { day, minute: Math.floor((local - day * DAY) / MINUTE) };
}

export interface SessionInfo {
  /** New York date of each bar. */
  day: number[];
  /** Minute of the New York day the bar starts. */
  minute: number[];
  /** Bar length in minutes, from the bars up to it; NaN before there are two. */
  barMinutes: number[];
  /** 0-based place among its date's regular-session bars; -1 outside the session. */
  sessionBar: number[];
  /** Index of its session's first bar; -1 outside the session. */
  sessionStart: number[];
}

const cache = new WeakMap<OHLCBar[], SessionInfo>();

export function sessionInfo(series: OHLCBar[]): SessionInfo {
  const cached = cache.get(series);
  if (cached) return cached;
  const n = series.length;
  const info: SessionInfo = {
    day: new Array(n),
    minute: new Array(n),
    barMinutes: new Array(n),
    sessionBar: new Array(n),
    sessionStart: new Array(n),
  };
  let smallest = Infinity;
  let count = -1;
  let start = -1;
  let lastDay = NaN;
  for (let i = 0; i < n; i++) {
    const { day, minute } = nyClock(series[i].time);
    info.day[i] = day;
    info.minute[i] = minute;
    // The smallest gap so far is the bar length: gaps across nights and
    // weekends are only ever longer.
    if (i > 0) {
      const gap = (series[i].time - series[i - 1].time) / MINUTE;
      if (gap > 0 && gap < smallest) smallest = gap;
    }
    info.barMinutes[i] = Number.isFinite(smallest) ? smallest : NaN;
    const inSession = minute >= SESSION_OPEN && minute < SESSION_CLOSE;
    if (!inSession) {
      info.sessionBar[i] = -1;
      info.sessionStart[i] = -1;
      continue;
    }
    if (day !== lastDay) {
      lastDay = day;
      count = 0;
      start = i;
    } else {
      count++;
    }
    info.sessionBar[i] = count;
    info.sessionStart[i] = start;
  }
  cache.set(series, info);
  return info;
}

/** Whether bars are shorter than a session, so the clock means something. */
export function isIntraday(info: SessionInfo, index: number): boolean {
  const m = info.barMinutes[index];
  return Number.isFinite(m) && m < SESSION_CLOSE - SESSION_OPEN;
}

/**
 * Whether a decision on this bar is the last chance to be flat by the close.
 * Orders fill at the next bar's open, so the exit goes in on the bar before
 * the session's last one: on hourly bars, the 14:30 bar's close fills at the
 * 15:30 open.
 */
export function isFlattenBar(info: SessionInfo, index: number): boolean {
  const m = info.barMinutes[index];
  return info.minute[index] + 2 * m >= SESSION_CLOSE;
}
