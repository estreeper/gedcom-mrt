# Single-image build: the Fastify server serves both the REST API and the built
# SPA. Deployed as one Cloud Run service per environment.

# --- Stage 1: build the frontend SPA -> /web/build ------------------------------
FROM node:20-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# --- Stage 2: build the backend -> /srv/dist ------------------------------------
FROM node:20-slim AS server-build
WORKDIR /srv
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# --- Stage 3: runtime -----------------------------------------------------------
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Production dependencies only.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# App code + static assets.
COPY --from=server-build /srv/dist ./dist
COPY --from=web /web/build ./build
ENV STATIC_DIR=/app/build
# Cloud Run injects PORT; default for local runs.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
