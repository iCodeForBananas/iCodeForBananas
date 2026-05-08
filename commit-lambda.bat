@echo off
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
"C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/micha/Workspace/iCodeForBananas && git add app/components/LambdaExportModal.tsx app/api/trading/lambdas/ && git commit -m 'feat: multi-step paper trading deploy flow with Tradier config, Supabase save, full strategy templates' && git push"
pause
