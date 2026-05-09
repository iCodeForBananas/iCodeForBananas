'use client';

import { useState, useMemo, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';

const RETURN_RATES: Record<string, number> = {
  none: 0,
  spy: 0.10,  // S&P 500 ~10% nominal
  qqq: 0.13,  // Nasdaq-100 ~13% nominal (since 1999)
};
const SAFE_WITHDRAWAL_RATE = 0.04; // 4% rule
const FIRE_MULTIPLIER = 25; // Rule of 25

type FireType = 'Lean FIRE' | 'Regular FIRE' | 'Fat FIRE';

function getFireType(annualExpenses: number): FireType {
  if (annualExpenses <= 50_000) return 'Lean FIRE';
  if (annualExpenses >= 100_000) return 'Fat FIRE';
  return 'Regular FIRE';
}

function calcProjection(income: number, expenses: number, inflation: number, currentAge: number, lifeExpectancy: number, returnRate: number, netWorth: number, partTimeIncome: number, monthly401k: number, employerMatchPct: number, matchCapPct: number) {
  const annual401k = monthly401k * 12;
  const matchableAmount = income * (matchCapPct / 100);
  const employerMatch = Math.min(annual401k, matchableAmount) * (employerMatchPct / 100);
  const yearlySavings = (income - expenses) + employerMatch;
  const totalYears = lifeExpectancy - currentAge;
  const empty = { data: [], retireAge: null as number | null, retireYearIdx: -1, fireNumber: expenses * FIRE_MULTIPLIER, fireType: getFireType(expenses), savingsRate: 0, coastFireAge: null as number | null, baristaFireAge: null as number | null };
  if (totalYears <= 0 || yearlySavings <= 0) return empty;

  const fireNumber = expenses * FIRE_MULTIPLIER; // Rule of 25
  const savingsRate = Math.round((yearlySavings / income) * 100);
  const fireType = getFireType(expenses);

  let retireAge: number | null = null;
  let retireIdx = -1;
  let coastFireAge: number | null = null;
  let baristaFireAge: number | null = null;

  // Build portfolio year by year
  let balance = netWorth;
  const balances: number[] = [];
  for (let y = 0; y <= totalYears; y++) {
    if (y > 0) {
      if (returnRate > 0) balance *= (1 + returnRate);
      balance += yearlySavings;
    }
    balances.push(balance);

    const inflatedFireNumber = fireNumber * Math.pow(1 + inflation, y);

    // FIRE: portfolio >= 25x current expenses (4% rule)
    if (retireAge == null && balance >= inflatedFireNumber) {
      retireAge = currentAge + y;
      retireIdx = y;
    }

    // Coast FIRE: current investments will grow to fireNumber by age 65 with no further contributions
    if (coastFireAge == null && returnRate > 0) {
      const yearsTo65 = 65 - (currentAge + y);
      if (yearsTo65 > 0) {
        const futureValue = balance * Math.pow(1 + returnRate, yearsTo65);
        const futureFireNumber = fireNumber * Math.pow(1 + inflation, y + yearsTo65);
        if (futureValue >= futureFireNumber) coastFireAge = currentAge + y;
      }
    }

    // Barista FIRE: part-time income covers gap between 4% withdrawal and expenses
    if (baristaFireAge == null && partTimeIncome > 0) {
      const inflatedExpenses = expenses * Math.pow(1 + inflation, y);
      const safeWithdrawal = balance * SAFE_WITHDRAWAL_RATE;
      if (safeWithdrawal + partTimeIncome >= inflatedExpenses) baristaFireAge = currentAge + y;
    }
  }

  // Chart data with drawdown phase
  const data = [];
  let drawdown = retireIdx >= 0 ? balances[retireIdx] : 0;
  for (let y = 0; y <= totalYears; y++) {
    const age = currentAge + y;
    const inflatedFireNumber = fireNumber * Math.pow(1 + inflation, y);

    let portfolio: number;
    if (retireIdx < 0 || y <= retireIdx) {
      portfolio = balances[y];
    } else {
      if (returnRate > 0) drawdown *= (1 + returnRate);
      drawdown -= expenses * Math.pow(1 + inflation, y);
      if (drawdown < 0) drawdown = 0;
      portfolio = drawdown;
    }

    data.push({ age, year: new Date().getFullYear() + y, portfolio: Math.round(portfolio), fireTarget: Math.round(inflatedFireNumber) });
  }

  return { data, retireAge, retireYearIdx: retireIdx, fireNumber, fireType, savingsRate, coastFireAge, baristaFireAge };
}

const fmt = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const STORAGE_KEY = 'fire-estimator';
type Saved = { income: number; monthlyExpenses: number; inflation?: number; age?: number; lifeExpectancy?: number; investIn?: string; netWorth?: number; partTimeIncome?: number; monthly401k?: number; employerMatchPct?: number; matchCapPct?: number };

function loadSaved(): Saved | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return null;
}

export default function FireEstimatorPage() {
  const [income, setIncome] = useState(100000);
  const [monthlyExpenses, setMonthlyExpenses] = useState(4167);
  const [inflation, setInflation] = useState(3);
  const [age, setAge] = useState(30);
  const [lifeExpectancy, setLifeExpectancy] = useState(80);
  const [investIn, setInvestIn] = useState<string>('spy');
  const [netWorth, setNetWorth] = useState(0);
  const [partTimeIncome, setPartTimeIncome] = useState(20000);
  const [monthly401k, setMonthly401k] = useState(0);
  const [employerMatchPct, setEmployerMatchPct] = useState(50);
  const [matchCapPct, setMatchCapPct] = useState(6);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loading saved state from localStorage on mount
      setIncome(saved.income);
      setMonthlyExpenses(saved.monthlyExpenses);
      if (saved.inflation != null) setInflation(saved.inflation);
      if (saved.age != null) setAge(saved.age);
      if (saved.lifeExpectancy != null) setLifeExpectancy(saved.lifeExpectancy);
      if (saved.investIn != null) setInvestIn(saved.investIn);
      if (saved.netWorth != null) setNetWorth(saved.netWorth);
      if (saved.partTimeIncome != null) setPartTimeIncome(saved.partTimeIncome);
      if (saved.monthly401k != null) setMonthly401k(saved.monthly401k);
      if (saved.employerMatchPct != null) setEmployerMatchPct(saved.employerMatchPct);
      if (saved.matchCapPct != null) setMatchCapPct(saved.matchCapPct);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify({ income, monthlyExpenses, inflation, age, lifeExpectancy, investIn, netWorth, partTimeIncome, monthly401k, employerMatchPct, matchCapPct }));
  }, [income, monthlyExpenses, inflation, age, lifeExpectancy, investIn, netWorth, partTimeIncome, monthly401k, employerMatchPct, matchCapPct, loaded]);

  const expenses = monthlyExpenses * 12;
  const returnRate = RETURN_RATES[investIn] ?? 0;
  const { data, retireAge, retireYearIdx, fireNumber, fireType, savingsRate, coastFireAge, baristaFireAge } = useMemo(
    () => calcProjection(income, expenses, inflation / 100, age, lifeExpectancy, returnRate, netWorth, partTimeIncome, monthly401k, employerMatchPct, matchCapPct),
    [income, expenses, inflation, age, lifeExpectancy, returnRate, netWorth, partTimeIncome, monthly401k, employerMatchPct, matchCapPct]
  );

  return (
    <main className="px-4 py-6 flex-1 metronome-static">
    <div className="w-full lg:max-w-5xl lg:mx-auto">
      <div className="rounded-lg p-6 bg-white">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-bold drop-shadow-lg" style={{ color: "#000" }} title="Find out when you can retire early by saving aggressively and investing — the younger you start and the more you save, the sooner you can stop working">🔥 FIRE Estimator</h1>
        <p className="text-lg mt-3" style={{ color: "#000" }}>Rule of 25 · 4% Safe Withdrawal Rate · When can you reach financial independence?</p>
      </div>

      <div className="flex flex-wrap gap-6 mb-6">
        <label className="flex flex-col gap-1" title="Starting earlier means more years of compound growth — even a few years makes a big difference in when you can retire">
          <span className="text-sm font-semibold">Current Age</span>
          <input type="number" value={age} onChange={(e) => setAge(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-28 bg-white" />
        </label>
        <label className="flex flex-col gap-1" title="How long your money needs to last — retiring at 35 with a life expectancy of 90 means 55 years of withdrawals">
          <span className="text-sm font-semibold">Life Expectancy</span>
          <input type="number" value={lifeExpectancy} onChange={(e) => setLifeExpectancy(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-28 bg-white" />
        </label>
        <label className="flex flex-col gap-1" title="Higher income means more you can save each year — the gap between this and your expenses is what gets invested toward retirement">
          <span className="text-sm font-semibold">Yearly Income (after tax)</span>
          <input type="number" step="1000" value={income} onChange={(e) => setIncome(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-48 bg-white" />
        </label>
        <label className="flex flex-col gap-1" title="Money you already have invested — a head start that compounds and can shave years off your retirement date">
          <span className="text-sm font-semibold">Current Net Worth</span>
          <input type="number" step="1000" value={netWorth} onChange={(e) => setNetWorth(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-48 bg-white" />
        </label>
        <label className="flex flex-col gap-1" title="The single biggest lever — cutting expenses lowers your FIRE number AND increases how much you save. Reducing by $500/mo can move retirement up by years">
          <span className="text-sm font-semibold">Monthly Expenses</span>
          <input type="number" step="100" value={monthlyExpenses} onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-48 bg-white" />
        </label>
        <label className="flex flex-col gap-1" title="With Barista FIRE, part-time income fills the gap so you can quit your career years before full FIRE — even a small side gig helps">
          <span className="text-sm font-semibold">Part-Time Income (yr)</span>
          <input type="number" step="1000" value={partTimeIncome} onChange={(e) => setPartTimeIncome(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-48 bg-white" />
        </label>
        <label className="flex flex-col gap-1" title="401k contributions come from pre-tax income and get invested — maxing this out accelerates your retirement date">
          <span className="text-sm font-semibold">Monthly 401k</span>
          <input type="number" step="100" value={monthly401k} onChange={(e) => setMonthly401k(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-36 bg-white" />
        </label>
        <label className="flex flex-col gap-1" title="Free money from your employer — a 50% match means every $1 you contribute adds $1.50 toward retirement">
          <span className="text-sm font-semibold">Employer Match %</span>
          <input type="number" step="5" value={employerMatchPct} onChange={(e) => setEmployerMatchPct(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-28 bg-white" />
        </label>
        <label className="flex flex-col gap-1" title="Your employer only matches up to this % of your salary — contribute at least this much to get the full free money">
          <span className="text-sm font-semibold">Match Cap %</span>
          <input type="number" step="1" value={matchCapPct} onChange={(e) => setMatchCapPct(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-28 bg-white" />
        </label>
        <label className="flex flex-col gap-1" title="Inflation raises your cost of living every year — higher inflation means you need a bigger portfolio to retire, pushing your date out">
          <span className="text-sm font-semibold">Inflation %</span>
          <input type="number" step="0.5" value={inflation} onChange={(e) => setInflation(Number(e.target.value))}
            className="border border-[#373A40]/30 rounded px-3 py-2 w-28 bg-white" />
        </label>
        <div className="flex flex-col gap-1 justify-end">
          <label className="flex flex-col gap-1" title="Investing in index funds grows your money faster — SPY or QQQ can cut years off your retirement date vs keeping cash">
            <span className="text-sm font-semibold">Invest In</span>
            <select value={investIn} onChange={(e) => setInvestIn(e.target.value)}
              className="border border-[#373A40]/30 rounded px-3 py-2 bg-white text-sm">
              <option value="none">None (cash)</option>
              <option value="spy">SPY (S&P 500)</option>
              <option value="qqq">QQQ (Nasdaq-100)</option>
            </select>
          </label>
          <span className="text-sm text-muted" title="The higher your savings rate, the sooner you retire — at 50% you're working one year for every year of freedom, at 75% you retire in roughly 7 years">Savings rate: {savingsRate}%</span>
          {returnRate > 0 && <span className="text-sm text-muted" title="Your investments compound at this rate each year — the difference between 10% and 13% can move your retirement date by several years">{investIn.toUpperCase()} avg: {(returnRate * 100).toFixed(1)}% nominal</span>}
        </div>
      </div>

      {/* FIRE metrics */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="rounded-xl px-4 py-3 bg-[#1A1B1E]/10 border border-[#373A40]/20 shadow-sm" title="This is how much you need to never work again — once your portfolio hits this number, you can withdraw 4% per year to cover expenses forever">
          <div className="text-xs font-semibold uppercase">FIRE Number (Rule of 25)</div>
          <div className="text-lg font-bold">{fmt(fireNumber)}</div>
          <div className="text-xs text-muted">4% safe withdrawal = {fmt(fireNumber * SAFE_WITHDRAWAL_RATE)}/yr</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-[#1A1B1E]/10 border border-[#373A40]/20 shadow-sm" title={`${fireType}: ${fireType === 'Lean FIRE' ? 'Retiring on ≤$50K/yr — you can quit sooner with a frugal lifestyle' : fireType === 'Fat FIRE' ? 'Retiring on $100K+/yr — comfortable but takes longer to reach' : 'Retiring on $50K–$100K/yr — a balanced approach'}. This is when you can stop working entirely.`}>
          <div className="text-xs font-semibold uppercase">{fireType}</div>
          <div className="text-lg font-bold">
            {retireAge != null
              ? `Retire at ${retireAge} — year ${new Date().getFullYear() + (retireAge - age)}`
              : 'Not reached'}
          </div>
          {retireAge != null && retireYearIdx >= 0 && (
            <div className="text-xs text-muted">
              Portfolio at retirement: {fmt(data[retireYearIdx]?.portfolio ?? 0)}
            </div>
          )}
        </div>
        {coastFireAge != null && (
          <div className="rounded-xl px-4 py-3 bg-[#1A1B1E]/10 border border-[#373A40]/20 shadow-sm" title="You can stop saving at this age — your investments will grow on their own to hit your FIRE number by 65. You still work to pay bills, but the pressure is off">
            <div className="text-xs font-semibold uppercase">Coast FIRE</div>
            <div className="text-lg font-bold">Age {coastFireAge}</div>
            <div className="text-xs text-muted">No more savings needed to retire at 65</div>
          </div>
        )}
        {baristaFireAge != null && (
          <div className="rounded-xl px-4 py-3 bg-[#1A1B1E]/10 border border-[#373A40]/20 shadow-sm" title="You can quit your career at this age — a chill part-time gig plus your investment withdrawals will cover all your expenses">
            <div className="text-xs font-semibold uppercase">Barista FIRE</div>
            <div className="text-lg font-bold">Age {baristaFireAge}</div>
            <div className="text-xs text-muted">Part-time {fmt(partTimeIncome)}/yr + 4% withdrawal covers expenses</div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-[#373A40]/30 p-4" style={{ height: 480 }} title="When the purple portfolio line crosses above the pink FIRE target line, you can retire — the green vertical line marks that age">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="age" tick={{ fontSize: 12 }} label={{ value: 'Age', position: 'insideBottom', offset: -2 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 12 }} width={60} />
            <Tooltip labelFormatter={(a) => `Age ${a}`} formatter={(v) => fmt(Number(v))} />
            <Legend />

            <Area type="monotone" dataKey="fireTarget" name="FIRE Number (25x Expenses)" stroke="#ff2f8a" strokeDasharray="6 3" fill="none" strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="portfolio" name="Portfolio" stroke="#6366f1" fill="url(#gradPortfolio)" strokeWidth={2} dot={false} />

            {retireAge != null && (
              <ReferenceLine x={retireAge} stroke="#22c55e" strokeDasharray="4 4"
                label={{ value: `Retire @ ${retireAge}`, position: 'top', fill: '#22c55e', fontSize: 12, fontWeight: 600 }} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
    </div>
    </main>
  );
}
