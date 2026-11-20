FROM node:22-bookworm-slim

# Chrome Headless Shell runtime libs + fonts (captions, emoji)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
    libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    fonts-noto-core fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx remotion browser ensure
# Bundle the compositions at build time (no webpack at runtime).
RUN npx remotion bundle src/remotion/index.ts --out-dir build

ENV NODE_ENV=production
# Keep the Node heap small; Chrome and ffmpeg need the rest of a 512 MB instance.
ENV NODE_OPTIONS=--max-old-space-size=192
EXPOSE 8080
CMD ["node", "server.mjs"]
