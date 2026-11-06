#!/bin/sh
# Makes the data folder writable by the `bun` user, then runs the server as `bun` instead of root.
#
# A folder mounted from the host keeps the host's owner, which may not be `bun`. (Docker named
# volumes don't have this problem.)
set -e

DATA_DIR="${WOL_DATA_DIR:-/data}"

# Already running as a normal user (`user:` in compose, or `docker run --user`), so there's
# nothing to fix and no permission to fix it with.
if [ "$(id -u)" != 0 ]; then
	exec "$@"
fi

mkdir -p "$DATA_DIR"

if [ "$(stat -c %u "$DATA_DIR")" != "$(id -u bun)" ]; then
	echo "entrypoint: giving the bun user ownership of $DATA_DIR" >&2
	chown -R bun:bun "$DATA_DIR" ||
		echo "entrypoint: warning: couldn't change the owner of $DATA_DIR, so the database may not open" >&2
fi

exec su-exec bun "$@"
