# CLI

- Wake
  - `wolnet wake {device-hostname}`: Wake a device by hostname that's on the list.
  - `wolnet wake {device-mac}`: Wake a device by mac address. Does not require the device to be added already.
  - `--wait {seconds}`: How long to wait for the device to come online before giving up. Defaults to `120`; `0` returns as soon as the packet is sent. The command blocks until the device answers, so it only prints `is awake` once that's true.

- Device List Mangement
  - `wolnet add --hostname {} --mac {} --comment {}`: Adds a device to the list
  - `wolnet remove {server-hostname-or-mac}`: Adds a device to the list. Aliases: rm
  - `wolnet scan`: Adds a device to the list by scanning for devices currently on the local network using a TUI
  - `wolnet devices`: Lists currently known devices. Aliases: list, ls

- Global flags
  - `--server {server-hostname:optional-port}`: Runs the command against another WolNet instance instead of the local one. Port `8778` is assumed, and `WOL_SERVER_URL` sets the default. Aliases: -s
  - `--replace`: Makes `add` describe the device in full, clearing the fields left out, rather than merging into the one already on the list.

<!-- - WolNet Mangement
  - `wolnet link {server-hostname:optional-port}`: Links this WolNet instance to another WolNet instance to share known devices.
  - `wolnet unlink {server-hostname}`: Removes a linked WolNet. Aliases: unlink, rm link
  - `wolnet sync`: Forces a multi-WolNet sync across ALL linked WolNets -->
