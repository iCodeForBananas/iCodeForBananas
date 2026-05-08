@echo off
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
"C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/micha/Workspace/iCodeForBananas && git restore --staged supabase/migrations/20260506_trading_schema.sql supabase/migrations/20260508_space_math_progress.sql supabase/migrations/20260508_trading_lambdas_tradier.sql tsconfig.json utils/supabase/client.ts utils/supabase/middleware.ts utils/supabase/server.ts 2>/dev/null; git add -A && git commit -m 'feat: paper trading, 7 new strategies, Tradier integration, migrations' && git push"
pause
