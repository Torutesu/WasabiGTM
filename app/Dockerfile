# Runtime for the "free" deployment: this image runs anywhere (a spare box, a
# VPS, a home server) and Cloudflare Tunnel puts it on a public hostname.
# See docs/deploy.md.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --maxsockets 4

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Emits .next/standalone; off by default so `next start` keeps working locally.
ENV BUILD_STANDALONE=1
# `prisma generate` only reads the URL, it never connects — the real one is
# supplied at runtime.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN npx prisma generate && npm run build

# The build stage keeps the Prisma CLI and tsx, so migrations and seeding run
# from here (see the `migrate` service in deploy/docker-compose.yml).
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S wasabi -u 1001
COPY --from=build --chown=wasabi:nodejs /app/.next/standalone ./
COPY --from=build --chown=wasabi:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=wasabi:nodejs /app/public ./public

USER wasabi
EXPOSE 3000
CMD ["node", "server.js"]
