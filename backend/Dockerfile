# ═══════════════════════════════════════════════════════════════════════════
# Megy Prints Backend — Node.js/Express API
# ═══════════════════════════════════════════════════════════════════════════

FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --prefer-offline --no-audit && npm cache clean --force

# Copy source
COPY . .

# Health check endpoint must exist
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/health || exit 1

EXPOSE 4000

CMD ["node", "server.js"]
