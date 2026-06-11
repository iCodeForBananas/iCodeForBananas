FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY game-server.ts ./

EXPOSE 8080
ENV GAME_WS_PORT=8080
ENV GAME_STATE_FILE=/data/game-state.json
VOLUME ["/data"]

# Run node directly (not via npx/npm) so SIGTERM reaches this process as PID 1,
# letting the server save game state on `docker stop` before exiting.
CMD ["node", "--import", "tsx", "game-server.ts"]
