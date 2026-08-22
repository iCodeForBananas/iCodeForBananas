@echo off
cd /d "C:\Users\micha\Workspace\iCodeForBananas"
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\index.lock" 2>nul
git add app/workout-tracker/WorkoutTrackerContent.tsx
git commit -m "Workout tracker: apply bento box styling to Activity, Body Part Coverage, All Entries panels

- Wrap Activity, Body Part Coverage, and All Entries in BentoBoard with draggable/resizable panels
- Match chord explorer PanelShell styling: rounded-2xl, border var(--border-color), yellow header text
- Add dark mode support throughout (dark:bg-neutral-900, dark:text-yellow-400/70, etc.)
- Log form and Weight Progress chart kept above BentoBoard as fixed controls
- Layout persisted to localStorage under 'workout-tracker-bento-layout'"
git push origin main
pause
