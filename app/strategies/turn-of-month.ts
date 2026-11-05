// Turn of the Month (Ariel, "A Monthly Effect in Stock Returns", 1987;
// Lakonishok & Smidt, 1988; McConnell & Xu, "Equity Returns at the Turn of the
// Month", Financial Analysts Journal, 2008)
// Most of the US market's return has historically come in a four-day window:
// the last trading day of a month and the first three of the next. McConnell &
// Xu found it in 30 of 35 countries and on US stocks from 1926 to 2005. Buy at
// the close of the last trading day, sell at the close of the third.
// Long only, and in the market only a few days a month, so its total return is
// a fraction of buy and hold's even where the edge holds; compare drawdowns.
//
// Days are trading dates in New York, so on intraday bars the window opens at
// the last bar of the month's last session and closes at the last bar of the
// exit day's session.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';

const DAY = 24 * 60 * 60 * 1000;
// A fixed UTC-5 offset puts every US session (13:30-21:00 UTC) on its own New
// York date year round; DST only moves it an hour, never across midnight.
const NY_OFFSET = 5 * 60 * 60 * 1000;

export interface MonthCalendar {
  /** 1-based trading day of the month the bar's date is. */
  dayOfMonth: number[];
  /** Trading days left in the month after the bar's date. */
  daysLeft: number[];
  /** Whether the bar is its date's last, where a daily close is. */
  lastBarOfDay: boolean[];
}

const calendarCache = new WeakMap<OHLCBar[], MonthCalendar>();

function weekdaysAfter(dayNumber: number): number {
  // Weekdays between this date and the end of its month. Holidays aren't
  // known, so this is only used for the series' final, unfinished month.
  const date = new Date(dayNumber * DAY);
  const month = date.getUTCMonth();
  let count = 0;
  for (let d = dayNumber + 1; new Date(d * DAY).getUTCMonth() === month; d++) {
    const weekday = new Date(d * DAY).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export function monthCalendar(series: OHLCBar[]): MonthCalendar {
  const cached = calendarCache.get(series);
  if (cached) return cached;

  const n = series.length;
  const dayNumbers = series.map((b) => Math.floor((b.time - NY_OFFSET) / DAY));
  const monthKey = (day: number) => {
    const d = new Date(day * DAY);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };

  // Distinct dates, each with its month, in order.
  const dates: { day: number; month: number }[] = [];
  const dateIndex: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i === 0 || dayNumbers[i] !== dayNumbers[i - 1]) dates.push({ day: dayNumbers[i], month: monthKey(dayNumbers[i]) });
    dateIndex[i] = dates.length - 1;
  }

  const dateDayOfMonth: number[] = new Array(dates.length);
  const dateDaysLeft: number[] = new Array(dates.length);
  for (let d = 0; d < dates.length; d++) {
    dateDayOfMonth[d] = d > 0 && dates[d - 1].month === dates[d].month ? dateDayOfMonth[d - 1] + 1 : 1;
  }
  const lastMonth = dates.length ? dates[dates.length - 1].month : 0;
  for (let d = dates.length - 1; d >= 0; d--) {
    if (d < dates.length - 1 && dates[d + 1].month === dates[d].month) dateDaysLeft[d] = dateDaysLeft[d + 1] + 1;
    else dateDaysLeft[d] = dates[d].month === lastMonth ? weekdaysAfter(dates[d].day) : 0;
  }

  const calendar: MonthCalendar = {
    dayOfMonth: dateIndex.map((d) => dateDayOfMonth[d]),
    daysLeft: dateIndex.map((d) => dateDaysLeft[d]),
    lastBarOfDay: dayNumbers.map((day, i) => i === n - 1 || dayNumbers[i + 1] !== day),
  };
  calendarCache.set(series, calendar);
  return calendar;
}

const parameters: StrategyParameter[] = [
  {
    key: 'entryDaysBefore',
    name: 'Entry (trading days before month end)',
    description: 'Buy at the close of this trading day counting back from month end; 1 = the last day (default: 1)',
    type: 'number',
    default: 1,
    min: 1,
    max: 5,
    step: 1,
  },
  {
    key: 'exitDay',
    name: 'Exit (trading day of new month)',
    description: 'Sell at the close of this trading day of the new month (default: 3)',
    type: 'number',
    default: 3,
    min: 1,
    max: 10,
    step: 1,
  },
];

const handler: StrategyHandler = ({ series, index, params, position }) => {
  const entryDaysBefore = (params.entryDaysBefore as number) || 1;
  const exitDay = (params.exitDay as number) || 3;

  const calendar = monthCalendar(series);
  if (!calendar.lastBarOfDay[index]) return { action: 'hold', reason: '' };

  const day = calendar.dayOfMonth[index];
  const left = calendar.daysLeft[index];
  const inEntryWindow = left < entryDaysBefore;

  if (position === 'long') {
    if (!inEntryWindow && day >= exitDay) {
      return { action: 'sell', reason: `Trading day ${day} of the month` };
    }
    return { action: 'hold', reason: '' };
  }

  if (left === entryDaysBefore - 1) {
    return { action: 'buy', reason: left === 0 ? 'Last trading day of the month' : `${left + 1} trading days before month end` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'turn-of-month',
  name: 'Turn of the Month',
  description: 'Buy at the close of the last trading day of the month, sell at the close of the third trading day of the next. Long only.',
  handler,
  parameters,
};

export default strategy;
