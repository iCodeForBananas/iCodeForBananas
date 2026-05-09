@echo off
cd /d "C:\Users\micha\Workspace\iCodeForBananas"
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
"C:\Program Files\Git\cmd\git.exe" add commit-all.bat
"C:\Program Files\Git\cmd\git.exe" commit -m "chore: update commit-all.bat"
"C:\Program Files\Git\cmd\git.exe" push
pause
