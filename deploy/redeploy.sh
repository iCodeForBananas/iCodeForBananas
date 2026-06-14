#!/usr/bin/env bash
# Run this ON the EC2 instance (in the repo directory) to deploy the latest
# game-server code without losing in-progress game state.
#
# How state survives:
#  - Player positions, money, items, zombies and gate state are stored in
#    the `game_state` table in Supabase (see supabase/migrations).
#  - `docker stop` sends SIGTERM, which game-server.mts catches to write
#    that row before exiting.
#  - On the next `docker run`, the new container reads it back and restores
#    each player as they reconnect (matched by their persistent client-side
#    id), so everyone reappears where they left off.
#
# Requires a `.env` file in this directory (not committed) containing:
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...
set -euo pipefail
cd "$(dirname "$0")/.."

git pull

docker build -t game-server .

docker stop game-server 2>/dev/null || true
docker rm game-server 2>/dev/null || true

docker run -d --name game-server --restart unless-stopped \
  -p 8080:8080 \
  --env-file deploy/.env \
  game-server

echo "Deployed. Tailing logs (Ctrl+C to stop watching, server keeps running)..."
docker logs -f game-server
