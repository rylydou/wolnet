# WolNet

A small Wake-on-LAN server. Wake your devices from a web page, from `curl`, or from the command line, and
WolNet tells you when they're actually on.

- Shows which devices are on, and updates live
- Waits until a woken device is on before it answers, so scripts know when they can connect
- Scans your network to find devices to add
- Checks devices with ARP, so it works even for devices that block ping and every port

## Run It

You need a Linux machine with Docker that's on the same network as the devices you want to wake.

```sh
curl -O https://raw.githubusercontent.com/rylydou/wolnet/main/compose.yaml
docker compose up -d
```

Then open `http://<server>:8778`. Add a device with its MAC address, or use **Scan Network** to find it.

WolNet uses host networking, because Wake-on-LAN packets can't leave Docker's own network. That's also why it
only works on Linux.

## Wake a Device

```sh
curl http://<server>:8778/api/wake/my-pc
```

This answers once `my-pc` is on, or after 2 minutes if it never comes on. See the [API docs](docs/api.md) for
more, or use the [command line tool](docs/cli.md).

### Wake a Device When You SSH Into It

Add this to `~/.ssh/config`:

```sh
Host my-pc
    ProxyCommand sh -c 'curl -fsS "http://<server>:8778/api/wake/%h" >/dev/null || true; exec nc %h %p'
```

SSH runs `ProxyCommand` with `exec`, so the `sh -c` is needed for both commands to run.

## HTTPS With Tailscale (Optional)

WolNet works over plain HTTP. If you use [Tailscale](https://tailscale.com), its traffic is already encrypted.
For an HTTPS address too, run this on the server:

```sh
tailscale serve --bg 8778
```

WolNet is then also at `https://<machine>.<tailnet>.ts.net`. The plain HTTP address keeps working.

## Settings

Set these as environment variables. Every one has a default, so none are required.

| Variable              | Default                    | What it does                                        |
| --------------------- | -------------------------- | --------------------------------------------------- |
| `PORT`                | `8778`                     | The port WolNet listens on.                         |
| `WOL_DATA_DIR`        | `data` (`/data` in Docker) | Where the database is kept.                         |
| `WOL_DB_AUTO_MIGRATE` | `true`                     | Update the database to the latest version on start. |

The [Bun adapter's settings](https://svelte.dev/docs/kit/adapter-bun#Environment-variables), like `HOST`, also
work.

## How It Works

- **Waking:** WolNet broadcasts a Wake-on-LAN "magic packet" for the device's MAC address, 3 times in case one
  gets lost.
- **Checking if a device is on:** Every 10 seconds (every 2 while a device is waking), WolNet asks each device
  "who has this IP address?" with `arping`. Every running device answers, even one that blocks ping and every
  port. For devices on another network, which ARP can't reach, it tries to open a TCP connection instead.
- **Scanning:** WolNet sends a tiny packet to every address on your network, which fills the system's ARP table
  with every device that's on. mDNS and UPnP add names, like `living-room-pi.local` or "Living Room TV".

## Development

You need Linux, [Bun](https://bun.com) 1.4 or newer, and `arping` from iputils (Fedora and Debian/Ubuntu
include it).

```sh
bun install
bun run dev      # Starts a dev server at http://localhost:8778
bun run check    # Checks types
bun run format   # Formats the code
```

To run a production build: `bun run build`, then `bun run start`.

The database is SQLite, managed with [Drizzle](https://orm.drizzle.team). After changing
`src/lib/server/db/schema.ts`, run `bun run db:generate` to create a migration. Migrations run when WolNet
starts.

### Where Things Are

- `src/routes/+page.svelte`: The web page
- `src/routes/data.remote.ts`: What the web page calls on the server ([remote functions](https://svelte.dev/docs/kit/remote-functions))
- `src/routes/api/`: The HTTP API
- `src/lib/server/`: Devices, status checks, and waking
- `src/lib/server/net/`: Network code (ARP, mDNS, UPnP, magic packets)
- `src/cli/index.ts`: The `wolnet` command

## Deploying

Every push to `main` builds a new image and publishes it as `ghcr.io/rylydou/wolnet:latest` (see
`.github/workflows/docker.yml`). To update a server, pull the new image. In Dockge, click **Update**. Without
Dockge, run `docker compose pull && docker compose up -d`.

Each image is also tagged `sha-<commit>`, so you can go back to an older one.
