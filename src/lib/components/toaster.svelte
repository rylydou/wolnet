<script lang="ts">
	import { flip } from "svelte/animate";
	import { quintOut } from "svelte/easing";
	import { fly } from "svelte/transition";
	import { dismiss, toasts } from "#lib/toasts.svelte.ts";

	let toaster = $state<HTMLElement>();

	// Open dialogs cover the rest of the page. Showing the toaster as a popover again on each new
	// toast puts it above them.
	$effect(() => {
		if (!toaster || toasts.length === 0) return;
		toaster.hidePopover();
		toaster.showPopover();
	});
</script>

<!-- `aria-live` makes screen readers read out each new message. -->
<div class="toaster" popover="manual" aria-live="polite" bind:this={toaster}>
	{#each toasts.slice(0, 3) as toast (toast.id)}
		<button
			class="toast"
			title="Dismiss"
			onclick={() => dismiss(toast.id)}
			in:fly={{ y: -50, duration: 200, easing: quintOut }}
			out:fly={{ x: 200, duration: 200, easing: quintOut }}
			animate:flip={{ duration: 200, easing: quintOut }}
		>
			{toast.text}
		</button>
	{/each}
</div>
