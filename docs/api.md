# API

Every response is JSON. Errors look like `{ "status": 404, "message": "No device called \"my-pc\"." }`.

`{device}` can be a device's hostname, IP address, MAC address, or id. MAC addresses can be written as
`00:1a:2b:3c:4d:5e`, `00-1A-2B-3C-4D-5E`, or `001a2b3c4d5e`.

| Request                        | What it does                         |
| ------------------------------ | ------------------------------------ |
| `GET /api/wake/{device}`       | Wake a device and wait until it's on |
| `GET /api/devices`             | List devices                         |
| `POST /api/devices`            | Add a device                         |
| `GET /api/devices/{device}`    | Get one device                       |
| `PATCH /api/devices/{device}`  | Change a device                      |
| `DELETE /api/devices/{device}` | Remove a device                      |
| `GET /api/scan`                | Find devices on the network          |

**Requests that change something (`POST`, `PATCH`, `DELETE`) must have the header
`content-type: application/json`**, even when there's no body. This is how WolNet tells them apart from
another website trying to make changes in your browser.

## Wake a Device

```sh
curl http://wolnet:8778/api/wake/my-pc
```

WolNet sends the wake signal, then waits until the device is on before it answers. If the device already shows as
on, it answers right away. The signal is sent either way, since it does nothing to a device that's awake.

`{device}` can also be any MAC address, even one that isn't on the list. WolNet doesn't know yet whether that
device is on, so it waits for it like any other.

`?wait=<seconds>` sets how long to wait. The default is `120` and the most is `240`. `?wait=0` sends the
signal and answers right away, without checking.

| Status | Meaning                                                    |
| ------ | ---------------------------------------------------------- |
| `200`  | The device is on                                           |
| `202`  | The signal was sent, but not checked (`?wait=0`)           |
| `504`  | The signal was sent, but the device didn't come on in time |
| `404`  | No device by that name, and it isn't a MAC address         |
| `400`  | The device has no MAC address, or `wait` is wrong          |

```jsonc
{
	"result": "awake", // "awake", "alreadyOnline", or "sent"
	"message": "my-pc is awake.",
	"device": {/* ... */}, // Left out for a MAC address that isn't on the list
}
```

## Devices

A device looks like this. Fields that aren't set are left out.

```jsonc
{
	"id": "k3x9q0m2a7bz",
	"name": "Living Room PC",
	"hostname": "my-pc.local",
	"ip": "10.10.1.20",
	"macAddress": "00:1a:2b:3c:4d:5e",
	"status": "online", // "online", "offline", or "waking"
	"lastWokenAt": "2026-11-05T18:00:00.000Z",
	"createdAt": "2026-11-01T12:00:00.000Z",
	"updatedAt": "2026-11-01T12:00:00.000Z",
}
```

`GET /api/devices` answers `{ "devices": [ ... ] }`, oldest first. The others answer with one device.

### Add or Change a Device

`POST` and `PATCH` take a JSON body with any of `name`, `hostname`, `macAddress`, and `ip`.

- `POST /api/devices` adds a device. It needs at least a hostname, MAC address, or IP address. It answers
  `201`.
- `PATCH /api/devices/{device}` changes only the fields you send. Send `""` to clear a field.

Both answer `409` if another device already has that hostname, MAC address, or IP address.

```sh
curl -X POST http://wolnet:8778/api/devices \
  -H 'content-type: application/json' \
  -d '{ "name": "Living Room PC", "macAddress": "00:1a:2b:3c:4d:5e", "ip": "10.10.1.20" }'
```

### Remove a Device

```sh
curl -X DELETE http://wolnet:8778/api/devices/my-pc -H 'content-type: application/json'
```

Answers with the device that was removed.

## Scan the Network

`GET /api/scan` takes a few seconds and answers with every device that answered:

```jsonc
{
	"subnets": ["10.10.1.0/24"],
	"devices": [
		{
			"ip": "10.10.1.20",
			"macAddress": "00:1a:2b:3c:4d:5e",
			"hostname": "my-pc.local", // From mDNS, if the device has it
			"name": "Living Room PC", // From UPnP, if the device has it
			"sources": ["arp", "mdns"], // How it was found
			"knownDeviceId": "k3x9q0m2a7bz", // Set if it's already on the list
		},
	],
}
```
