# ────────────────────────────────────────────────────────────────────
# CramSheet production image
#
# Base: official Playwright image (Chromium + system deps pre-installed)
# — saves us 100+ MB of apt installs vs node-slim, and the Chromium
# version matches the `playwright` npm dep we already pinned.
# ────────────────────────────────────────────────────────────────────

# ───── Stage 1: deps ─────
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS deps
WORKDIR /app

# Copy lockfile + package.json only — better cache layer.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ───── Stage 2: build ─────
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS build
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the Next.js standalone bundle.
RUN npm run build

# ───── Stage 3: runtime ─────
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Playwright's bundled Chromium lives at /ms-playwright in this image.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

# Healthcheck — Railway uses this to know we're up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["npm", "run", "start"]
