// Market Intraday Momentum (Gao, Han, Li & Zhou, "Market Intraday Momentum",
// Journal of Financial Economics, 2018)
// The market's return from the prior close through the first part of the
// session predicts its return into the close, most strongly on volatile days,
// as hedgers rebalance and late informed traders follow the morning. Go the
// way of the morning move for the end of the session, then go flat.
// Orders fill at the next open, so on hourly bars the trade runs from the
// entry bar's open to the 15:30 open. Intraday bars only.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';
import { sessionInfo, isIntraday, isFlattenBar, SESSION_CLOSE } from './session';

const parameters: StrategyParameter[] = [
  {
    key: 'morningBars',
    name: 'Morning Bars',
    description: 'Session bars that make the morning move (hourly: 1 = to 10:30)',
    type: 'number',
    default: 1,
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: 'holdBars',
    name: 'Bars Held',
    description: 'Bars before the flatten bar to enter (hourly: 1 enters at the 14:30 open)',
    type: 'number',
    default: 1,
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: 'minMovePercent',
    name: 'Minimum Move (%)',
    description: 'Only trade when the morning move is at least this large',
    type: 'number',
    default: 0.25,
    min: 0,
    max: 2,
    step: 0.05,
  },
];

const handler: StrategyHandler = ({ series, index, params, position }) => {
  const morningBars = (params.morningBars as number) ?? 1;
  const holdBars = (params.holdBars as number) ?? 1;
  const minMove = ((params.minMovePercent as number) ?? 0.25) / 100;

  const info = sessionInfo(series);
  if (!isIntraday(info, index)) return { action: 'hold', reason: 'Needs intraday bars' };
  const bar = info.sessionBar[index];
  const start = info.sessionStart[index];

  if (position) {
    if (bar <= 0 || isFlattenBar(info, index)) return { action: position === 'long' ? 'sell' : 'buy', reason: 'Flat by the close' };
    return { action: 'hold', reason: '' };
  }
  if (bar < 0 || start < 1) return { action: 'hold', reason: '' };

  // Enter on the bar whose decision fills `holdBars` bars before the flatten
  // bar's fill: the flatten bar is holdBars bars ahead.
  const step = info.barMinutes[index];
  const entryBar = info.minute[index] + (holdBars + 2) * step >= SESSION_CLOSE && !isFlattenBar(info, index);
  if (!entryBar || bar < morningBars) return { action: 'hold', reason: '' };

  const priorClose = series[start - 1].close;
  const morningClose = series[start + morningBars - 1].close;
  const move = (morningClose - priorClose) / priorClose;
  if (move >= minMove) return { action: 'buy', reason: `Morning up ${(move * 100).toFixed(2)}%` };
  if (move <= -minMove) return { action: 'sell', reason: `Morning down ${(move * 100).toFixed(2)}%` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'intraday-momentum',
  name: 'Intraday Momentum',
  description: 'Intraday: when the move from the prior close through the morning is large enough, trade its direction into the end of the session and go flat before the close.',
  handler,
  parameters,
};

export default strategy;
