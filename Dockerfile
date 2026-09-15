# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
FROM oven/bun:1.4-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change doesn't reinstall them.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---- runtime --------------------------------------------------------------
FROM oven/bun:1.4-alpine AS runtime
WORKDIR /app

# `svelte-adapter-bun` emits a standalone server, so nothing but the build output and the
# migrations (read at startup, relative to the working directory) has to come along.
COPY --from=build /app/build ./build
COPY --from=build /app/migrations ./migrations

# Persistent state lives on a volume rather than in the image's writable layer.
ENV NODE_ENV=production \
	WOL_DATA_DIR=/data \
	PORT=3000
RUN mkdir -p /data && chown bun:bun /data
VOLUME /data

USER bun
EXPOSE 3000
CMD ["bun", "run", "./build/index.js"]
