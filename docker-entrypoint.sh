#!/bin/sh
# Make the data directory writable by the user the server runs as, then drop to that user.
#
# `chown` in the Dockerfile only reaches the image's own `/data`. When compose bind-mounts a host
# directory over it, that directory arrives with the host's ownership instead - and Docker creates
# a missing bind-mount source as root, which the unprivileged server then cannot write to. Named
# volumes don't have the problem: Docker copies the image's ownership onto a fresh one.
set -e

DATA_DIR="${WOL_DATA_DIR:-/data}"

# Already unprivileged (compose set `user:`, or the image was run with --user): nothing to fix up,
# and no permission to fix it up with.
if [ "$(id -u)" != 0 ]; then
	exec "$@"
fi

mkdir -p "$DATA_DIR"

if [ "$(stat -c %u "$DATA_DIR")" != "$(id -u bun)" ]; then
	echo "entrypoint: taking ownership of $DATA_DIR for bun" >&2
	chown -R bun:bun "$DATA_DIR" ||
		echo "entrypoint: warning - could not chown $DATA_DIR; the server may fail to open its database" >&2
fi

exec su-exec bun "$@"
