# WolNet - A Wake on LAN server

Use the web GUI or CLI to add devices:

```sh
$ wolnet add --mac 00:11:22:33:44:55 --hostname pc.local
```

Then use the simple API to wake the device

```sh
# Wake an added device by its hostname
curl "http://wolnet:8778/api/wake/pc.local" && echo "The device is awake!"

# Or wake a device without needing to add it first:
curl "http://wolnet:8778/api/wake/00:11:22:33:44:55" && echo "The device is awake!"
```

### Tips:

- WolNet works great in tandem with Tailscale!

### Automatically wake a device when using SSH:

- Update your SSH config:

```sh
# ~/.ssh/config
Host hostname
    HostName hostname
    User username
    ProxyCommand curl -fsS "http://wolnet.local:8778/api/wake/%h" >/dev/null || true; exec nc %h %p
```
