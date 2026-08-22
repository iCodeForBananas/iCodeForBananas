@echo off
cd /d "C:\Users\micha\Workspace\iCodeForBananas"
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\index.lock" 2>nul
git add app/workout-tracker/WorkoutTrackerContent.tsx
git add "app/lead-sheet-editor/[id]/preview/page-client.tsx"
git add push_workout_bento.bat
git add push_leadsheet_video_toggle.bat
git commit -m "Workout tracker blue activity graph + lead sheet YouTube toggle

- Activity graph: yellow -> blue gradient for higher contrast
  (#e2e8f0 no activity, #bfdbfe light, #3b82f6 medium, #1e3a8a heavy)
- Lead sheet: Play split button with YouTube icon toggle (blue=on, gray=off)"
git push origin main
pause
