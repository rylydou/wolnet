<script lang="ts">
	import { toast } from "$lib/common/toasts";
	import { Field, Window } from "$lib/components";
	import type { Device } from "$lib/types";
	import { formatMacAddress } from "$lib/util";
	import type { RemoteFormField } from "@sveltejs/kit";
	import { tick } from "svelte";
	import { createDevice, deleteDevice, getDevices, updateDevice, wakeDevice } from "./data.remote";

	/** The four editable fields, which `createDevice` and `updateDevice` share. */
	type DeviceFields = Record<"comment" | "hostname" | "macAddress" | "ip", RemoteFormField<string>>;

	let addDeviceDialog = $state<HTMLDialogElement>();
	let editDeviceDialog = $state<HTMLDialogElement>();
	let editingDevice = $state<Device>();

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
</script>

<!--
	Shared by both dialogs. `device` seeds each input's default value, so the edit form opens
	populated and a native reset restores the saved values rather than blanking the form.
-->
{#snippet deviceFields(fields: DeviceFields, device?: Device)}
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
			<button class="btn" onclick={() => addDeviceDialog?.showModal()}>Add Device...</button>
			<!-- <button class="btn">Manage WolNet...</button> -->
			<!-- <button class="btn">Scan Network for Devices...</button> -->
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

<dialog class="window_frame" bind:this={addDeviceDialog} onclose={() => createDevice.element?.reset()}>
	<div class="window_titlebar">
		Add Device...
		<div class="window_titlebar_controls">
			<button aria-label="Close" onclick={() => addDeviceDialog?.close()}>X</button>
		</div>
	</div>

	<form {...addDevice} style="padding-inline: 12px; padding-block: 16px;">
		{@render deviceFields(createDevice.fields)}

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
