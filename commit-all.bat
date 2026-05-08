@echo off
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
"C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/micha/Workspace/iCodeForBananas && git add -A && git commit -m 'chore: add all pending changes' && git push"
pause
