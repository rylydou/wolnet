# Command Line

The `wolnet` command talks to a WolNet server over the [API](api.md).

- In Docker, it's already installed: `docker exec wolnet wolnet devices`
- Anywhere else with [Bun](https://bun.com), copy `src/cli/index.ts`, or run `bun run cli` in this repo

`<device>` can be a hostname, IP address, MAC address, or id.

## Commands

- `wolnet wake <device>`: Wake a device and wait until it's on. `<device>` can also be any MAC address, even one
  that isn't on the list.
  - `--wait <seconds>`: How long to wait. The default is `120`, the most is `240`. `0` means don't wait.
- `wolnet devices`: List devices and whether they're on. Also `list` or `ls`.
- `wolnet add`: Add a device. Give at least `--hostname`, `--mac`, or `--ip`.
- `wolnet edit <device>`: Change a device. Only the fields you give change. Use `""` to clear one, like
  `--name ""`.
- `wolnet remove <device>`: Remove a device. Also `rm`.
- `wolnet scan`: Find devices on the network. Add one with `wolnet add`.

Fields for `add` and `edit`:

- `--name <text>`: What to call it, like `"Living Room PC"`
- `--hostname <name>`: Like `my-pc.local`
- `--mac <address>`: Like `00:1a:2b:3c:4d:5e`
- `--ip <address>`: Like `10.10.1.20`

## Which Server

By default, `wolnet` uses the server on this machine (`localhost:8778`). To use another one:

- `--server <host>` (or `-s`) for one command, like `wolnet -s truenas wake my-pc`. The port defaults to `8778`.
- `WOL_SERVER_URL` to change the default, like `export WOL_SERVER_URL=http://truenas:8778`.

## Examples

```sh
wolnet add --name "Living Room PC" --mac 00:1a:2b:3c:4d:5e --ip 10.10.1.20
wolnet wake 10.10.1.20
wolnet edit 10.10.1.20 --hostname my-pc.local
wolnet rm my-pc.local
```
