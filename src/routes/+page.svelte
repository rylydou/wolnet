<script lang="ts">
	import { SvelteSet } from "svelte/reactivity";
	import Dialog from "#lib/components/dialog.svelte";
	import Field from "#lib/components/field.svelte";
	import Window from "#lib/components/window.svelte";
	import { toast, toastError } from "#lib/toasts.svelte.ts";
	import { deviceLabel, type Device, type DeviceStatus, type DiscoveredDevice } from "#lib/types.ts";
	import { addDevice, discoverDevices, editDevice, getDevices, removeDevice, wakeDevice } from "./data.remote";

	type DeviceFields = Pick<Device, "name" | "hostname" | "macAddress" | "ip">;

	const devices = getDevices();

	// Each time a form opens it gets a fresh instance (`for(key)`), so it never shows values or
	// errors left over from last time.
	let formKey = 0;

	let adding = $state<{ form: ReturnType<typeof addDevice.for>; values: DeviceFields }>();
	let editing = $state<{ form: ReturnType<typeof editDevice.for>; device: Device }>();

	const openAdd = (values: DeviceFields = {}) => (adding = { form: addDevice.for(`${formKey++}`), values });
	const openEdit = (device: Device) => (editing = { form: editDevice.for(`${formKey++}`), device });

	// Scanning takes a few seconds, so it only starts once the scan window opens. Opening it again
	// shows the last result. "Scan Again" runs a new scan.
	let scanOpen = $state(false);
	const scan = $derived(scanOpen ? discoverDevices() : undefined);

	/** Devices with a wake request on its way to the server. */
	const requested = new SvelteSet<string>();

	const wake = async (device: Device) => {
		requested.add(device.id);
		try {
			if ((await wakeDevice(device.id)) === "alreadyOnline") toast(`${deviceLabel(device)} is already on.`);
		} catch (error) {
			toastError(error);
		} finally {
			requested.delete(device.id);
		}
	};

	const remove = async (device: Device) => {
		if (!confirm(`Delete ${deviceLabel(device)}? This can't be undone.`)) return;

		try {
			await removeDevice(device.id);
			editing = undefined;
			toast(`Deleted ${deviceLabel(device)}.`);
		} catch (error) {
			toastError(error);
		}
	};

	// Say how each wake turned out once the device stops showing as waking. This also covers wakes
	// started from the API or CLI, or in another tab.
	let lastStatuses = new Map<string, DeviceStatus>();
	$effect(() => {
		if (!devices.ready) return;

		for (const device of devices.current) {
			if (lastStatuses.get(device.id) !== "waking" || device.status === "waking") continue;

			toast(
				device.status === "online"
					? `${deviceLabel(device)} is awake.`
					: `${deviceLabel(device)} didn't wake up. Is Wake-on-LAN turned on for it?`,
				device.status === "online" ? 5_000 : 10_000,
			);
		}

		lastStatuses = new Map(devices.current.map((device) => [device.id, device.status]));
	});

	const STATUS_LABELS: Record<DeviceStatus, string> = { online: "On", offline: "Off", waking: "Waking up" };

	/** The details to show under a device's name, minus whichever one is already its name. */
	const details = (device: Device) =>
		[device.hostname, device.ip, device.macAddress].filter((detail) => detail && detail !== deviceLabel(device));

	/** A scanned device can't be added again if it's already on the list (matched by MAC or IP). */
	const isAdded = (found: DiscoveredDevice) =>
		found.knownDeviceId !== undefined ||
		(devices.ready &&
			devices.current.some(
				(device) => (found.macAddress && device.macAddress === found.macAddress) || device.ip === found.ip,
			));

	const addFound = (found: DiscoveredDevice) => {
		scanOpen = false;
		openAdd({ name: found.name, hostname: found.hostname, ip: found.ip, macAddress: found.macAddress });
	};
</script>

{#snippet deviceFields(form: NonNullable<typeof adding | typeof editing>["form"], values: DeviceFields)}
	<Field label="Name" issues={form.fields.name.issues()}>
		<input class="input" placeholder="Living Room PC" {...form.fields.name.as("text", values.name ?? "")} />
	</Field>
	<Field label="Hostname" issues={form.fields.hostname.issues()}>
		<input class="input" placeholder="my-pc.local" {...form.fields.hostname.as("text", values.hostname ?? "")} />
	</Field>
	<Field label="MAC Address" issues={form.fields.macAddress.issues()}>
		<input
			class="input"
			placeholder="00:1a:2b:3c:4d:5e"
			{...form.fields.macAddress.as("text", values.macAddress ?? "")}
		/>
	</Field>
	<Field label="IP Address" issues={form.fields.ip.issues()}>
		<input class="input" placeholder="192.168.1.20" {...form.fields.ip.as("text", values.ip ?? "")} />
	</Field>
	{#each form.fields.issues() ?? [] as issue (issue.message)}
		<p class="field-error" role="alert">{issue.message}</p>
	{/each}
{/snippet}

<svelte:head>
	<title>WolNet</title>
</svelte:head>

<main class="page">
	<header class="page-header">
		<h1>WolNet</h1>
		<div class="row">
			<button class="btn" onclick={() => openAdd()}>Add Device...</button>
			<button class="btn" onclick={() => (scanOpen = true)}>Scan Network...</button>
		</div>
	</header>

	<Window title="Devices">
		{#if devices.error}
			<p>Couldn't load devices. {devices.error.message}</p>
		{:else if !devices.ready}
			<p>Loading devices...</p>
		{:else if devices.current.length === 0}
			<p>No devices yet. Add one, or scan the network to find some.</p>
		{:else}
			<ul class="list">
				{#each devices.current as device (device.id)}
					{@const waking = device.status === "waking" || requested.has(device.id)}
					<li class="list-row">
						<span
							class="status status-{waking ? 'waking' : device.status}"
							role="img"
							aria-label={STATUS_LABELS[device.status]}
							title={STATUS_LABELS[device.status]}
						></span>
						<div class="list-text">
							<span class="selectable">{deviceLabel(device)}</span>
							<span class="details muted selectable">
								{#each details(device) as detail (detail)}
									<span>{detail}</span>
								{:else}
									<span>No address</span>
								{/each}
							</span>
						</div>
						<div class="row">
							<button
								class="btn compact"
								disabled={!device.macAddress || waking}
								title={device.macAddress ? undefined : "Add a MAC address to wake this device."}
								onclick={() => wake(device)}
							>
								{waking ? "Waking..." : "Wake"}
							</button>
							<button class="btn compact" onclick={() => openEdit(device)}>Edit</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Window>
</main>

<Dialog title="Add Device" open={!!adding} onclose={() => (adding = undefined)}>
	{#if adding}
		{@const { form, values } = adding}
		<form
			class="dialog-body"
			{...form.enhance(async (submission) => {
				try {
					if (!(await submission.submit())) return;
					adding = undefined;
					toast("Added device.");
				} catch (error) {
					toastError(error);
				}
			})}
		>
			{@render deviceFields(form, values)}
			<button class="btn wide" type="submit" disabled={form.pending > 0}>
				{form.pending > 0 ? "Adding..." : "Add"}
			</button>
		</form>
	{/if}
</Dialog>

<Dialog title="Edit Device" open={!!editing} onclose={() => (editing = undefined)}>
	{#if editing}
		{@const { form, device } = editing}
		<form
			class="dialog-body"
			{...form.enhance(async (submission) => {
				try {
					if (!(await submission.submit())) return;
					editing = undefined;
					toast("Saved device.");
				} catch (error) {
					toastError(error);
				}
			})}
		>
			<input {...form.fields.id.as("hidden", device.id)} />
			{@render deviceFields(form, device)}
			<button class="btn wide" type="submit" disabled={form.pending > 0}>
				{form.pending > 0 ? "Saving..." : "Save"}
			</button>
			<button class="btn compact wide" type="button" disabled={removeDevice.pending > 0} onclick={() => remove(device)}>
				Delete Device
			</button>
		</form>
	{/if}
</Dialog>

<Dialog title="Scan Network" class="scan-window" bind:open={scanOpen}>
	{#if scan}
		<div class="scan-results">
			{#if scan.error}
				<p class="dialog-body">Couldn't scan the network. {scan.error.message}</p>
			{:else if !scan.ready}
				<p class="dialog-body">Looking for devices. This takes a few seconds...</p>
			{:else if scan.current.devices.length === 0}
				<p class="dialog-body">
					{scan.current.subnets.length === 0 ? "No local network found to scan." : "No devices answered."}
				</p>
			{:else}
				<div class="scan-columns scan-header" aria-hidden="true">
					<span>Name</span>
					<span>IP Address</span>
					<span>MAC Address</span>
				</div>
				<ul class="list">
					{#each scan.current.devices as found (found.ip)}
						{@const added = isAdded(found)}
						<li>
							<button
								class="scan-columns scan-row"
								disabled={added}
								title="Found with {found.sources.join(', ').toUpperCase()}"
								onclick={() => addFound(found)}
							>
								<span class="scan-name" class:muted={!found.name && !found.hostname}>
									{found.name ?? found.hostname ?? "No name"}
								</span>
								<span class="scan-ip">{found.ip}</span>
								<span class="scan-mac" class:muted={!found.macAddress}>{found.macAddress ?? "No MAC"}</span>
								<span class="scan-action">{added ? "Added" : "Add"}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<footer class="scan-footer">
			<span class="muted">
				{#if scan.ready}
					{scan.current.devices.length} found on {scan.current.subnets.join(", ")}
				{/if}
			</span>
			<button class="btn compact" onclick={() => scan.refresh()} disabled={scan.loading}>
				{scan.loading ? "Scanning..." : "Scan Again"}
			</button>
		</footer>
	{/if}
</Dialog>
