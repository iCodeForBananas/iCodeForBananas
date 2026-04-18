# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server (Turbopack, 4GB memory limit)
npm run build        # Production build
npm run lint         # ESLint check
npm run download-data  # Download stock market CSV data via Yahoo Finance
```

No test framework is configured.

## Architecture

**iCodeForBananas** is a Next.js App Router application — a suite of 27+ independent interactive tools across music theory, algorithmic trading, personal finance, and learning games. All routes live under `app/`, each as a self-contained folder.

### Stack
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4, Motion (animations), Recharts (charts)
- Supabase (auth only — `utils/supabase/`)
- Google Gemini AI (wordsmith feature, key stored in httpOnly cookie)
- Yahoo Finance 2 (data download script, not runtime dependency)

### Route Layout

The root layout (`app/layout.tsx`) renders a two-column UI: a sidebar nav + main content. Providers wrapping the tree: `ThemeProvider` (light-only, no toggle) and `FavoriteChordsProvider` (localStorage).

Key route groups:
- `/harmonic-flow` — flagship music theory chord-scale resolver (850+ combinations)
- `/algo-backtest` — backtesting engine with equity curves, Donchian/EMA indicators
- `/chord-*`, `/circle-of-fifths`, `/fretboard-*` — music theory tools
- `/fire-estimator` — personal finance calculator
- `/workout-tracker` — auth-protected, redirects to `/login` if unauthenticated
- `/wordsmith` — Gemini-powered text generation
- `/spelling-bee`, `/brainy-bloom`, `/space-math` — learning games

API routes under `app/api/`:
- `/api/spy-data` — loads CSV from `/data/`, computes indicators server-side
- `/api/gemini-key` — sets/reads Gemini key from httpOnly cookie
- `/api/data-files` — lists available data files
- `/api/wordsmith-generate` — proxies Gemini requests

### Key Libraries (`app/lib/`)

- `music.ts` — music theory engine: 40+ chord types, chromatic scale (`["A","A#","B","C",...]`), default guitar tuning `["E","A","D","G","B","E"]`, 12 frets
- `chordShapes.ts` — 500+ pre-defined fretboard chord positions (root, frets, bassFret, fingers, name, mode)
- `ThemeContext.tsx` — light-mode only context
- `FavoriteChordsContext.tsx` — favorites persisted to localStorage

### Types (`app/types.ts`)

Central type definitions for the trading module: `PricePoint`, `Position`, `BacktestResult`, `IndicatorData` (with dynamic keys like `sma{N}`, `ema{N}`), `TradeSignal`, `BacktestTrade`.

### Auth

Supabase SSR via `@supabase/ssr`. `middleware.ts` calls `updateSession()` on every request (except static assets). The `useAuth()` hook (`app/hooks/useAuth.ts`) provides user state and `signOut`. Only `/workout-tracker` is currently protected.

### Market Data

`scripts/download-data.mjs` downloads OHLCV CSVs into `/data/` using Yahoo Finance. Intervals: 1m (7d), 5m (59d), 1h (730d), 1d (10y). The `/api/spy-data` route reads these files and computes indicators (Donchian, EMA, RSI, MACD, ATR, Bollinger Bands) server-side before returning to the client.

### Path Alias

`@/*` maps to the project root — use `@/app/lib/music` not relative paths.
