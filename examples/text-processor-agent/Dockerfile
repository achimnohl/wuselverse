FROM node:20-slim

WORKDIR /app

# Install the example's own dependencies, including the published SDK package.
COPY package*.json ./
RUN npm install --include=dev --legacy-peer-deps

# Copy the rest of the agent source.
COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["sh", "-c", "export MCP_PORT=${PORT:-8080}; npm start"]
