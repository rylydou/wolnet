# CLI

- Wake
  - `wolnet wake {device-hostname}`: Wake a device by hostname that's on the list.
  - `wolnet wake {device-mac}`: Wake a device by mac address. Does not require the device to be added already.

- Device List Mangement
  - `wolnet add --hostname {} --mac {} --comment {}`: Adds a device to the list
  - `wolnet scan`: Adds a device to the list by scanning for devices currently on the local network
  - `wolnet [devices|list|ls]`: Lists currently known devices

- WolNet Mangement
  - `wolnet link {server-hostname:optionalPort}`: Links this WolNet instance to another WolNet instance to share known devices.
  - `wolnet [unlink|rm link]{server-hostname}`: Removes a linked WolNet
  - `wolnet sync`: Forces a multi-WolNet sync across ALL linked WolNets
