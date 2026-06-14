FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY game-server.mts ./

EXPOSE 8080
ENV GAME_WS_PORT=8080

# Run node directly (not via npx/npm) so SIGTERM reaches this process as PID 1,
# letting the server save game state on `docker stop` before exiting.
CMD ["node", "--import", "tsx", "game-server.mts"]
