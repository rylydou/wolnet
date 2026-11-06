<script lang="ts">
	import type { Snippet } from "svelte";

	type Props = {
		title: string;
		open: boolean;
		class?: string;
		onclose?: () => void;
		children: Snippet;
	};

	let { title, open = $bindable(), class: className, onclose, children }: Props = $props();

	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (open && !dialog?.open) dialog?.showModal();
		if (!open && dialog?.open) dialog.close();
	});
</script>

<!-- Pressing Escape closes the dialog without going through `open`, so `onclose` syncs it back. -->
<dialog
	bind:this={dialog}
	class="window {className}"
	onclose={() => {
		open = false;
		onclose?.();
	}}
>
	<header class="window-titlebar">
		{title}
		<button class="window-close" aria-label="Close" onclick={() => (open = false)}>X</button>
	</header>

	{#if open}
		{@render children()}
	{/if}
</dialog>
