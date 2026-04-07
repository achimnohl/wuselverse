# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy workspace sources needed for the API build
COPY nx.json tsconfig.json tsconfig.base.json jest.preset.js ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY examples ./examples

# Build the NestJS API bundle
RUN npx nx build platform-api --configuration=production

FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install runtime dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the built API bundle from the builder stage
COPY --from=builder /app/dist/apps/platform-api ./dist/apps/platform-api

# Cloud Run injects PORT automatically at runtime
EXPOSE 3000

CMD ["node", "dist/apps/platform-api/main.js"]
