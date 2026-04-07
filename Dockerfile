# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS builder
WORKDIR /app

ENV CI=true
ENV NX_DAEMON=false

# Copy the full Nx workspace. The .dockerignore keeps the context small.
COPY . .

# The build stage needs devDependencies (Nx, TypeScript, webpack, etc.).
RUN npm ci --legacy-peer-deps --include=dev
RUN ./node_modules/.bin/nx reset
RUN ./node_modules/.bin/nx build platform-api --configuration=production --skip-nx-cache

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NX_DAEMON=false

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/dist/apps/platform-api ./dist/apps/platform-api

# Cloud Run injects PORT automatically at runtime.
EXPOSE 3000

CMD ["node", "dist/apps/platform-api/main.js"]
