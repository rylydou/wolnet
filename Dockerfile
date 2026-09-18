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

# Runs the adapter's server with the origin fix in `server.js`; see the comment there.
COPY --from=build /app/server.js ./server.js

# The `wolnet` CLI is a thin HTTP client (see its own header comment) with no dependencies beyond
# `node:util`, so it just needs to be on PATH - talking to the server over WOL_SERVER_URL (unset,
# it defaults to localhost:PORT, i.e. this same container) rather than through the build output.
COPY --from=build /app/src/cli/index.ts /usr/local/bin/wolnet
RUN chmod +x /usr/local/bin/wolnet

# Persistent state lives on a volume rather than in the image's writable layer.
ENV NODE_ENV=production \
	WOL_DATA_DIR=/data \
	PORT=8778
RUN mkdir -p /data && chown bun:bun /data
VOLUME /data

# The entrypoint runs as root just long enough to make the data directory writable - a bind-mounted
# host directory arrives with the host's ownership, which the chown above cannot reach - and then
# drops to `bun` with su-exec. The server process itself never runs as root.
RUN apk add --no-cache su-exec
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 8778
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "./server.js"]
