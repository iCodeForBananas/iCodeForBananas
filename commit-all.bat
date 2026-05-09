@echo off
cd /d "C:\Users\micha\Workspace\iCodeForBananas"
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
"C:\Program Files\Git\cmd\git.exe" add -A
"C:\Program Files\Git\cmd\git.exe" commit -m "feat: strategy indicator overlays + remove TP from risk management UI"
"C:\Program Files\Git\cmd\git.exe" push
pause
