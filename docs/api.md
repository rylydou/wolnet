# API

All endpoints accept a JSON or form-encoded body, and respond with JSON. Errors respond with an
appropriate status and `{ "message": "..." }`.

A device can be referred to by its hostname, its MAC address (`00:1a:2b:3c:4d:5e`, `00-1A-...` or
`001a2b3c4d5e`), or its id.

## Wake

- `GET|POST /api/wake/{device-hostname}` — wakes a known device from the list.
- `GET|POST /api/wake/{device-mac}` — wakes any device by MAC address. It does not have to be on
  the list; an unknown MAC is still sent a magic packet, it just can't be confirmed afterwards.

If the device has an IP, it is probed first and, after the packet goes out, polled until it answers
— so a response means it is genuinely up. `?wait=<seconds>` sets that window (default `30`, `0`
answers as soon as the packet is sent).

```jsonc
{
	"woken": true, // a magic packet was sent
	"alreadyOnline": false, // it was reachable before anything was sent
	"confirmed": false, // it answered a probe
	"device": {/* … */}, // omitted for a MAC that isn't on the list
}
```

## Device list

- `GET /api/devices` — lists every device on the list, oldest first, as `{ "devices": [ … ] }`.
- `POST|PATCH /api/add-device` — adds a device, or modifies the one already matching the given
  hostname or MAC address. Responds `201` with the new device, or `200` with the updated one.
  Accepts `hostname`, `macAddress`, `ip` and `comment`; at least one of the first three is
  required. The two verbs differ only in what happens to an existing device:
  - `POST` **replaces** it — fields left out are cleared, so the call describes it in full.
  - `PATCH` **merges** — fields left out keep their stored value. Clearing one therefore needs a
    `POST`, since a blank field reads as "not given".
- `POST|DELETE /api/remove-device/{device-hostname-or-mac}` — removes a device from the list.
  Responds with `{ "removed": { … } }`.
