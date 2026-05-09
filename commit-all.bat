@echo off
cd /d "C:\Users\micha\Workspace\iCodeForBananas"
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
"C:\Program Files\Git\cmd\git.exe" add supabase/migrations/20260509_strategy_scheduling.sql
"C:\Program Files\Git\cmd\git.exe" add app/api/trading/lib/executor.ts
"C:\Program Files\Git\cmd\git.exe" add app/api/trading/execute/route.ts
"C:\Program Files\Git\cmd\git.exe" add app/api/trading/run-all/route.ts
"C:\Program Files\Git\cmd\git.exe" add app/api/trading/lambdas/route.ts
"C:\Program Files\Git\cmd\git.exe" add "app/api/trading/lambdas/[id]/route.ts"
"C:\Program Files\Git\cmd\git.exe" add app/components/LambdaExportModal.tsx
"C:\Program Files\Git\cmd\git.exe" add app/paper-trading/page.tsx
"C:\Program Files\Git\cmd\git.exe" add app/algo-backtest/page.tsx
"C:\Program Files\Git\cmd\git.exe" add vercel.json
"C:\Program Files\Git\cmd\git.exe" add commit-all.bat
"C:\Program Files\Git\cmd\git.exe" commit -m "feat: single scheduler, auth-gated deploy, timeframe-aware strategy runner"
"C:\Program Files\Git\cmd\git.exe" push
pause
