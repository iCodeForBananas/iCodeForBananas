@echo off
cd /d "C:\Users\micha\Workspace\iCodeForBananas"
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\index.lock" 2>nul
git add "app/lead-sheet-editor/[id]/preview/page-client.tsx"
git add "app/lead-sheet-editor/StringPads.tsx"
git commit -m "Lead sheet: add string pads to preview toolbar

- New StringPads.tsx: Web Audio API string pad synthesizer
  - Detuned triangle/sawtooth oscillators with chorus spread
  - LFO vibrato for warm/ethereal styles
  - Lowpass filter + delay feedback per style
  - Three styles: warm, bright, ethereal
  - Attack/release envelope on master gain
- StringPadsControl UI: on/off button, style picker, volume slider, key badge
- Wired into both toolbar locations (normal + fullscreen) in page-client.tsx
- Settings persisted to sheet.metadata.strings via Supabase (debounced 800ms)
- Song key drives chord tones (root/third/fifth across 2 octaves); defaults to G"
git push origin main
pause
