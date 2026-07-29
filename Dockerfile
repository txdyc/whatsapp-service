# --- Frontend build stage ---
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Backend build stage ---
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runner stage ---
FROM node:20-alpine AS runner

WORKDIR /app
COPY package*.json ./
# prisma CLI is needed at runtime to run "migrate deploy" on startup
RUN npm ci --production && npm install --no-save prisma@^7.8.0
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=web-builder /app/web/dist ./web/dist
COPY prisma ./prisma
COPY prisma.config.ts ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/app.js"]
