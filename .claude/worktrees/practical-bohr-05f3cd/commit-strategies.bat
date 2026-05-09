@echo off
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
"C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/micha/Workspace/iCodeForBananas && git add app/strategies/ app/algo-backtest/page.tsx && git commit -m 'feat: add 7 new trading strategies (RSI-2, Supertrend, Triple EMA, Keltner, Chandelier, ROC Momentum, Stochastic)' && git push"
pause
