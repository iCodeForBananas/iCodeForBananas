@echo off
cd /d "C:\Users\micha\Workspace\iCodeForBananas"
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\index.lock" 2>nul
git add "app/lead-sheet-editor/[id]/preview/page-client.tsx"
git commit -m "Lead sheet preview: optional YouTube video in playback

- Play button is now a split button: main [Play] + [YT] toggle on the right
- When a song has a YouTube link, clicking YT icon toggles video mode on/off
- Blue YT icon = video enabled; gray YT icon = audio-only (drum + lyric follow)
- Video panel and YouTube transport clock are both suppressed when disabled
- Default remains video-on for songs that have a link (existing behavior)"
git push origin main
pause
