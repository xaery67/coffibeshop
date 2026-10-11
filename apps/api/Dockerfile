# ── Stage 1: builder ──
FROM node:25-alpine AS builder
WORKDIR /app

# Copy manifests dulu (layer cache)
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install semua dependency workspace (termasuk dev untuk build)
RUN npm ci --workspace=@coffibeshop/api --workspace=@coffibeshop/shared --include-workspace-root || npm install

# Copy source
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared DULU (api meng-import @coffibeshop/shared) lalu Prisma + TS
RUN npm run build --workspace=@coffibeshop/shared \
 && npm run db:generate --workspace=@coffibeshop/api \
 && npm run build --workspace=@coffibeshop/api

# ── Stage 2: runtime (distroless, non-root) ──
FROM gcr.io/distroless/nodejs20-debian12 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json ./package.json

USER nonroot
EXPOSE 4000
CMD ["apps/api/dist/server.js"]
