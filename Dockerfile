# syntax=docker/dockerfile:1

# ---- Build ----
# The build output is plain JavaScript that runs on any CPU, so build on the machine's own platform.
# Building an arm64 image then doesn't have to run Bun under emulation.
FROM --platform=$BUILDPLATFORM oven/bun:1.4-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---- Run ----
FROM oven/bun:1.4-alpine
WORKDIR /app

# - iputils-arping: checks whether devices are on (see `src/lib/server/net/arping.ts`). It needs
#   the `CAP_NET_RAW` capability, which Docker gives containers by default. `setcap` lets the
#   unprivileged `bun` user use it.
# - su-exec: lets the entrypoint drop from root to `bun`.
RUN apk add --no-cache iputils-arping su-exec libcap-setcap \
	&& setcap cap_net_raw=p "$(readlink -f "$(command -v arping)")" \
	&& apk del libcap-setcap

# The build bundles every dependency, so no `node_modules` is needed.
COPY --from=build /app/build ./build
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/server.js ./server.js

# The CLI has no dependencies, so it can be copied onto the PATH as is.
COPY --from=build --chmod=755 /app/src/cli/index.ts /usr/local/bin/wolnet

# SHUTDOWN_TIMEOUT: an open browser tab holds a connection open, so don't wait for it longer than
# Docker waits for the container to stop (10 seconds).
ENV NODE_ENV=production \
	WOL_DATA_DIR=/data \
	PORT=8778 \
	SHUTDOWN_TIMEOUT=5
RUN mkdir -p /data && chown bun:bun /data
VOLUME /data

COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 8778
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "./server.js"]
