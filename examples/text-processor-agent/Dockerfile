FROM node:20-slim

WORKDIR /app

# Copy the monorepo and let the existing root .dockerignore exclude noise.
COPY . .

# Install dependencies required by the example agent runtime and build the shared SDK.
RUN npm install --include=dev
RUN npm run build:agent-sdk

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app/examples/text-processor-agent

EXPOSE 8080

CMD ["sh", "-c", "export MCP_PORT=${PORT:-8080}; npm start"]
