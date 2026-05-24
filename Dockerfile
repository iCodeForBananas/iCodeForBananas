FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY game-server.ts ./

EXPOSE 8080
ENV GAME_WS_PORT=8080

CMD ["npx", "tsx", "game-server.ts"]
