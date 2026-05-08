@echo off
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
"C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/micha/Workspace/iCodeForBananas && git add app/space-math/page.tsx app/components/Sidebar.tsx app/learning-progress/ app/api/space-math/ supabase/migrations/20260508_space_math_progress.sql && git commit -m 'Add Cais Learning Progress tracker with Space Math Supabase integration' && git push"
pause
