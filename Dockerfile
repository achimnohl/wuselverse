# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS builder
WORKDIR /app

ENV CI=true
ENV NX_DAEMON=false

# Copy the full Nx workspace. The .dockerignore keeps the context small.
COPY . .

# Install dependencies and build the production API bundle.
RUN npm ci --legacy-peer-deps
RUN npx nx reset
RUN npx nx build platform-api --configuration=production --skip-nx-cache
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NX_DAEMON=false

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/apps/platform-api ./dist/apps/platform-api

# Cloud Run injects PORT automatically at runtime.
EXPOSE 3000

CMD ["node", "dist/apps/platform-api/main.js"]
