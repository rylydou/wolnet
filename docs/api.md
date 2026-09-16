# API

All endpoints accept a JSON or form-encoded body, and respond with JSON. Errors respond with an
appropriate status and `{ "message": "..." }`.

A device can be referred to by its hostname, its MAC address (`00:1a:2b:3c:4d:5e`, `00-1A-...` or
`001a2b3c4d5e`), or its id.

## Wake

- `GET|POST /api/wake/{device-hostname}` — wakes a known device from the list.
- `GET|POST /api/wake/{device-mac}` — wakes any device by MAC address. It does not have to be on
  the list.

The request is held open until the device is actually online. It is checked first — if it already
answers, the response comes back immediately and no packet is sent — and otherwise polled every two
seconds after the packet goes out, so a `200` means it is genuinely up. `?wait=<seconds>` sets how
long to poll (default `120`); a device that never answers within it is a `504`.

A MAC address is enough on its own: a device is looked for on the local network by ARP, which needs
no IP address and works even when the device refuses every port. So a device with no IP address on
record, or one that isn't on the list at all, is confirmed like any other. `?wait=0` is the only
case that goes unconfirmed, and answers `202` — the packet went out, nothing was checked.

ARP does not cross a router, so a device on another network can't be confirmed that way; one with an
IP address on record falls back to probing it, which does work off-segment (though Wake-on-LAN
itself doesn't).

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
