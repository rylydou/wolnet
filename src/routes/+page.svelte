<script lang="ts">
	import { toast } from "$lib/common/toasts";
	import { Field, Window } from "$lib/components";
	import type { Device, DeviceDefaults, DiscoveredDevice, DiscoverySource } from "$lib/types";
	import { formatMacAddress } from "$lib/util";
	import type { RemoteFormField } from "@sveltejs/kit";
	import { tick } from "svelte";
	import { createDevice, deleteDevice, discoverDevices, getDevices, updateDevice, wakeDevice } from "./data.remote";

	/** The four editable fields, which `createDevice` and `updateDevice` share. */
	type DeviceFields = Record<"comment" | "hostname" | "macAddress" | "ip", RemoteFormField<string>>;

	let addDeviceDialog = $state<HTMLDialogElement>();
	let editDeviceDialog = $state<HTMLDialogElement>();
	let scanDialog = $state<HTMLDialogElement>();
	let editingDevice = $state<Device>();

	/** Seeds the add form, so a device picked out of a scan arrives with its fields filled in. */
	let addDeviceDefaults = $state<DeviceDefaults>();

	// A scan takes a few seconds and talks to the whole network, so the query is only created once
	// the dialog has been opened - merely loading the page shouldn't start one. Re-opening the dialog
	// reuses the cached result rather than re-scanning; `scan.refresh()` is what deliberately re-runs.
	let scanOpen = $state(false);
	const scan = $derived(scanOpen ? discoverDevices() : undefined);

	const devices = getDevices();

	// Replaces the default `enhance` behaviour, which only resets the form, so that a successful
	// submission also dismisses the dialog and confirms itself.
	const addDevice = createDevice.enhance(async (form) => {
		if (!(await form.submit())) return;

		// The reset event fires before the inputs are updated, so let the DOM settle first.
		await tick();
		form.element.reset();
		addDeviceDialog?.close();

		toast("Added device.");
	});

	// `for(id)` gives each device its own form instance, so the values and validation issues from
	// one edit are never carried over into the next. Unlike the add form there is no reset, because
	// the inputs should keep showing what was just saved.
	const editing = $derived.by(() => {
		const device = editingDevice;
		if (!device) return undefined;

		const form = updateDevice.for(device.id);

		return {
			device,
			form,
			props: form.enhance(async (instance) => {
				if (!(await instance.submit())) return;

				editDeviceDialog?.close();
				toast("Saved device.");
			}),
		};
	});

	const editDevice = (device: Device) => {
		editingDevice = device;
		editDeviceDialog?.showModal();
	};

	// `for(id)` gives each device its own form instance, matching the pattern used for edit and wake.
	const removeDevice = (device: Device) =>
		deleteDevice.for(device.id).enhance(async (form) => {
			if (!confirm(`Delete ${device.comment || deviceAddress(device) || device.id}? This cannot be undone.`)) return;
			if (!(await form.submit())) return;

			editDeviceDialog?.close();
			toast("Deleted device.");
		});

	// `for(id)` reuses the same instance across renders, so `pending` reflects an in-flight wake
	// even though this is called fresh from the markup on every device.
	const wake = (device: Device) =>
		wakeDevice.for(device.id).enhance(async (form) => {
			if (!(await form.submit())) return;
			toast(`Sent wake signal to ${device.comment || deviceAddress(device) || device.id}.`);
		});

	const deviceAddress = (device: Device) =>
		[
			...(device.comment ? [] : [device.hostname]),
			device.ip,
			device.macAddress === undefined ? undefined : formatMacAddress(device.macAddress),
		]
			.filter(Boolean)
			.join(" / ");

	/**
	 * Opens the add form, optionally pre-filled - which is how a scan result becomes a device.
	 *
	 * `as(...)` seeds each input's *default* value rather than its current one, so on a dialog that
	 * has been opened before the inputs keep whatever they last held. Resetting the form once the new
	 * defaults have rendered is what makes them show: it pulls every input back to its default, which
	 * both fills in a device picked from a scan and clears one left over from the previous time.
	 */
	const openAddDevice = async (defaults?: DeviceDefaults) => {
		addDeviceDefaults = defaults;
		addDeviceDialog?.showModal();

		await tick();
		createDevice.element?.reset();
	};

	const openScan = () => {
		scanOpen = true;
		scanDialog?.showModal();
	};

	/**
	 * Hands a discovered device to the add form. Its UPnP name becomes the comment, since that is the
	 * name a person gave the device, while the mDNS hostname is the name the device answers to.
	 */
	const addDiscovered = (found: DiscoveredDevice) => {
		scanDialog?.close();
		openAddDevice({
			comment: found.name,
			hostname: found.hostname,
			ip: found.ip,
			macAddress: found.macAddress,
		});
	};

	// The scan is a snapshot, so a device added from it would still look unknown until the next one.
	// Cross-referencing the live device list instead keeps the "Added" marker correct straight away.
	const isAdded = (found: DiscoveredDevice) =>
		found.knownDeviceId !== undefined ||
		(devices.ready &&
			devices.current.some(
				(device) =>
					(found.macAddress !== undefined && device.macAddress === found.macAddress) || device.ip === found.ip,
			));

	const discoveredName = (found: DiscoveredDevice) => found.name || found.hostname || found.ip;

	/** How each protocol is worth naming to someone reading the list, rather than its internal key. */
	const sourceLabels: Record<DiscoverySource, string> = {
		arp: "ARP",
		mdns: "mDNS",
		ssdp: "UPnP",
	};

	const discoveredFrom = (found: DiscoveredDevice) => found.sources.map((source) => sourceLabels[source]).join(", ");

	const discoveredAddress = (found: DiscoveredDevice) =>
		[
			found.name && found.hostname ? found.hostname : undefined,
			found.ip,
			found.macAddress === undefined ? undefined : formatMacAddress(found.macAddress),
		]
			.filter(Boolean)
			.join(" / ");
</script>

<!--
	Shared by both dialogs. `device` seeds each input's default value, so the edit form opens
	populated and a native reset restores the saved values rather than blanking the form. The add
	form passes the values carried over from a scan, which is what pre-fills it.
-->
{#snippet deviceFields(fields: DeviceFields, device?: DeviceDefaults)}
	<Field issues={fields.hostname.issues()}>
		{#snippet label()}
			Device Hostname
		{/snippet}
		{#snippet input()}
			<input class="input" {...fields.hostname.as("text", device?.hostname ?? "")} />
		{/snippet}
	</Field>
	<Field issues={fields.macAddress.issues()}>
		{#snippet label()}
			MAC Address
		{/snippet}
		{#snippet input()}
			<input
				class="input"
				{...fields.macAddress.as("text", device?.macAddress === undefined ? "" : formatMacAddress(device.macAddress))}
			/>
		{/snippet}
	</Field>
	<Field issues={fields.ip.issues()}>
		{#snippet label()}
			IP Address
		{/snippet}
		{#snippet hint()}
			Can be IPv4 or IPv6.
		{/snippet}
		{#snippet input()}
			<input class="input" {...fields.ip.as("text", device?.ip ?? "")} />
		{/snippet}
	</Field>
	<Field issues={fields.comment.issues()}>
		{#snippet label()}
			Comment
		{/snippet}
		{#snippet input()}
			<input class="input" {...fields.comment.as("text", device?.comment ?? "")} />
		{/snippet}
	</Field>
{/snippet}

<svelte:head>
	<title>Wake on LAN - Devices</title>
</svelte:head>

<main class="dash-layout">
	<header class="dash-header">
		<h1>WolNet - Devices</h1>
		<div class="dash-header-controls">
			<button class="btn" onclick={() => openAddDevice()}>Add Device...</button>
			<button class="btn" onclick={openScan}>Scan Network...</button>
			<!-- <button class="btn">Manage WolNet...</button> -->
		</div>
	</header>

	<Window style="margin-top: calc(8px * var(--pixel-scale));">
		{#snippet windowTitle()}
			Devices
		{/snippet}
		{#if devices.error}
			<p>Could not load devices. {devices.error.message}</p>
		{:else if !devices.ready}
			<p>Loading devices...</p>
		{:else if devices.current.length === 0}
			<p>No devices yet. Add one to get started.</p>
		{:else}
			<ul class="device-list">
				{#each devices.current as device (device.id)}
					<li class="device">
						<div class="device-info">
							<div class="device-name">
								<span
									class="device-status"
									class:device-status--online={device.status === "online"}
									title={device.status === "online" ? "Online" : "Offline"}
								></span>
								<span style="user-select: text;">
									{device.comment || device.hostname || device.id}
								</span>
							</div>
							<span class="device-address">{deviceAddress(device) || "< no address >"}</span>
						</div>

						<div class="device-controls">
							<form {...wake(device)}>
								<input type="hidden" name="id" value={device.id} />
								<button
									class="btn compact"
									type="submit"
									disabled={!device.macAddress || wakeDevice.for(device.id).pending > 0}
								>
									{wakeDevice.for(device.id).pending > 0 ? "Waking..." : "Wake"}
								</button>
							</form>
							<button class="btn compact" onclick={() => editDevice(device)}>Edit</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Window>
</main>

<!-- Clearing the defaults on close stops a device picked from a scan seeding the next manual add. -->
<dialog
	class="window_frame"
	bind:this={addDeviceDialog}
	onclose={() => {
		createDevice.element?.reset();
		addDeviceDefaults = undefined;
	}}
>
	<div class="window_titlebar">
		Add Device...
		<div class="window_titlebar_controls">
			<button aria-label="Close" onclick={() => addDeviceDialog?.close()}>X</button>
		</div>
	</div>

	<form {...addDevice} style="padding-inline: 12px; padding-block: 16px;">
		<!-- Re-keying rebuilds the inputs, so new defaults win over whatever was typed before. -->
		{#key addDeviceDefaults}
			{@render deviceFields(createDevice.fields, addDeviceDefaults)}
		{/key}

		{#each createDevice.fields.issues() ?? [] as issue (issue.message)}
			<p class="fieldset-error" role="alert">{issue.message}</p>
		{/each}

		<button class="btn" style="width: 100%; margin-top: 12px;" type="submit" disabled={createDevice.pending > 0}>
			{createDevice.pending > 0 ? "Adding..." : "Add"}
		</button>
	</form>
</dialog>

<!-- Dropping `editingDevice` on close releases the keyed form instance along with its state. -->
<dialog class="window_frame" bind:this={editDeviceDialog} onclose={() => (editingDevice = undefined)}>
	<div class="window_titlebar">
		Edit Device...
		<div class="window_titlebar_controls">
			<button aria-label="Close" onclick={() => editDeviceDialog?.close()}>X</button>
		</div>
	</div>

	{#if editing}
		<form {...editing.props} style="padding-inline: 12px; padding-block: 16px;">
			{@render deviceFields(editing.form.fields, editing.device)}

			{#each editing.form.fields.issues() ?? [] as issue (issue.message)}
				<p class="fieldset-error" role="alert">{issue.message}</p>
			{/each}

			<button class="btn" style="width: 100%; margin-top: 12px;" type="submit" disabled={editing.form.pending > 0}>
				{editing.form.pending > 0 ? "Saving..." : "Save"}
			</button>
		</form>

		<form {...removeDevice(editing.device)} style="padding-inline: 12px; padding-block-end: 16px;">
			<input type="hidden" name="id" value={editing.device.id} />
			<button
				class="btn compact"
				style="width: 100%;"
				type="submit"
				disabled={deleteDevice.for(editing.device.id).pending > 0}
			>
				{deleteDevice.for(editing.device.id).pending > 0 ? "Deleting..." : "Delete Device"}
			</button>
		</form>
	{/if}
</dialog>

<!--
	Dropping `scanOpen` on close releases the query, so the scan isn't kept alive by a hidden dialog.
	Re-opening serves the cached result; "Scan Again" is the only thing that touches the network.
-->
<dialog class="window_frame scan-window" bind:this={scanDialog} onclose={() => (scanOpen = false)}>
	<div class="window_titlebar">
		Scan Network...
		<div class="window_titlebar_controls">
			<button aria-label="Close" onclick={() => scanDialog?.close()}>X</button>
		</div>
	</div>

	{#if scan}
		<div class="scan-body">
			{#if scan.error}
				<p>Could not scan the network. {scan.error.message}</p>
			{:else if !scan.ready}
				<p>Scanning the network for devices...</p>
				<p class="scan-note">This takes a few seconds while every address is checked.</p>
			{:else if scan.current.devices.length === 0}
				<p>No devices answered.</p>
				<p class="scan-note">
					{scan.current.subnets.length === 0
						? "No local network was found to scan."
						: `Nothing replied on ${scan.current.subnets.join(", ")}.`}
				</p>
			{:else}
				<ul class="device-list">
					{#each scan.current.devices as found (found.ip)}
						{@const added = isAdded(found)}
						<li>
							<button
								class="discovered"
								type="button"
								disabled={added}
								title={added ? "Already in your device list." : ""}
								onclick={() => addDiscovered(found)}
							>
								<span class="device-info">
									{#if found.name}
										<span class="device-name">{found.name}</span>
									{/if}
									<span class="device-address">{discoveredAddress(found)}</span>
									<span class="discovered-source">Discovered from: {discoveredFrom(found)}</span>
								</span>
								<span class="discovered-action">{added ? "Added" : "Add"}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="scan-footer">
			<span class="scan-note">
				{#if scan.ready && scan.current.subnets.length > 0}
					Scanned {scan.current.subnets.join(", ")}
				{/if}
			</span>
			<button class="btn compact" onclick={() => scan.refresh()} disabled={!scan.ready}>
				{scan.ready ? "Scan Again" : "Scanning..."}
			</button>
		</div>
	{/if}
</dialog>
