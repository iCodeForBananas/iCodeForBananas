#!/usr/bin/env bash
# Run this ON the EC2 instance (in the repo directory) to deploy the latest
# game-server code without losing in-progress game state.
#
# How state survives:
#  - /data inside the container is bind-mounted to ./game-data on the host.
#  - `docker stop` sends SIGTERM, which game-server.ts catches to write
#    /data/game-state.json (player positions, money, items, zombies, gates).
#  - On the next `docker run`, the new container reads that file and
#    restores each player as they reconnect (matched by their persistent
#    client-side id), so everyone reappears where they left off.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull
mkdir -p game-data

docker build -t game-server .

docker stop game-server 2>/dev/null || true
docker rm game-server 2>/dev/null || true

docker run -d --name game-server --restart unless-stopped \
  -p 8080:8080 \
  -v "$(pwd)/game-data:/data" \
  game-server

echo "Deployed. Tailing logs (Ctrl+C to stop watching, server keeps running)..."
docker logs -f game-server
