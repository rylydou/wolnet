# API

- Wake endpoints: Responds when device is successfully woken up or is already online
  - `/api/wake/{device-name}`: Wakes a known device by it's hostname that's on the list.
  - `/api/wake/{device-mac}`: Wakes a device with a given MAC Address. Does not require the device to be added already.
- Device List Management
- `/api/add-device`: Adds or modifies a device in the list
- `/api/remove-device/{device-name-or-mac}`: Removes a device by ID or hostname
