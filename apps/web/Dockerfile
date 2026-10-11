# ── Stage 1: builder ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN npm ci --workspace=@coffibeshop/web --workspace=@coffibeshop/shared --include-workspace-root || npm install
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
# Build shared DULU — web meng-import @coffibeshop/shared (main -> dist/index.js)
RUN npm run build --workspace=@coffibeshop/shared \
 && npm run build --workspace=@coffibeshop/web

# ── Stage 2: runtime (nginx) ──
FROM nginx:1.31-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
