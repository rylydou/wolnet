# WOL Server

A Wake-on-LAN server: a SvelteKit app on Bun, storing devices in SQLite.

## Development

```sh
bun install
bun run dev
```

That's the whole setup - no `.env` file, no database bootstrapping. Every environment variable
declared in [`src/env.ts`](src/env.ts) has a default, and on first start the server creates
`data/data.sqlite` and applies the migrations in `migrations/` to it. Copy
[`.env.example`](.env.example) to `.env` only when you want to override something.

### Database

The schema lives in [`src/lib/server/db/schema`](src/lib/server/db/schema). After changing it:

```sh
bun run db:generate   # write a migration for the change
bun run db:studio     # browse the database
```

Migrations are committed, and are applied automatically on startup (`WOL_DB_AUTO_MIGRATE`), so a
fresh clone and a running deployment converge on the same schema without a manual step.

## CLI

`wolnet` is a thin HTTP client for the server, so it works the same whether the server runs on this
machine or elsewhere:

```sh
bun run cli devices               # or: wolnet devices, once linked with `bun link`
bun run cli add --hostname my-desktop.local --mac 00:1a:2b:3c:4d:5e
bun run cli wake my-desktop.local
```

`--server nas.local:3333` (or `-s`) runs any command against another instance, and `WOL_SERVER_URL`
changes the default from `http://localhost:3333`. See
[`docs/cli.md`](docs/cli.md) for the full command list, or run `wolnet help`.

## Docker

```sh
docker compose up -d --build
```

The app is then on port 3333 of the host. Two things about the container are worth knowing:

- **Host networking.** Wake-on-LAN is a UDP broadcast, and broadcasts don't cross Docker's bridge
  network, so the container shares the host's network stack in order to reach the LAN. That is also
  why [`compose.yaml`](compose.yaml) publishes no ports - set `PORT` to move the server instead.
- **`/data`.** Persistent state lives at `/data` in the container (`WOL_DATA_DIR`), the counterpart
  of `data/` in the project root during development. Compose backs it with a named volume; see the
  comment in `compose.yaml` to bind-mount a host directory instead.
