@echo off
cd /d C:\Users\micha\Workspace\iCodeForBananas
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\index.lock" 2>nul
git add -A
git commit -m "Arrangement: multi-track recorder with IndexedDB + Supabase sync"
git push origin main
pause
