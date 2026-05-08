@echo off
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
"C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/micha/Workspace/iCodeForBananas && git add app/components/LambdaExportModal.tsx app/paper-trading/ app/api/trading/ app/components/Sidebar.tsx supabase/migrations/20260508_trading_lambdas_tradier.sql && git commit -m 'feat: paper trading dashboard with equity curves, deploy modal, execute API, Tradier integration' && git push"
pause
