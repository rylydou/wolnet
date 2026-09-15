<script lang="ts">
	import { flip } from "svelte/animate";
	import { quintOut as ease, quintOut } from "svelte/easing";
	import { fly } from "svelte/transition";
	import { toasts } from "./toast-store.svelte";
</script>

<div class="toaster">
	{#each toasts.slice(0, 3) as toast, index (toast.id)}
		<div
			class="toast"
			in:fly={{ x: 0, y: -200, duration: 200, easing: quintOut }}
			out:fly={{ x: 200, y: 0, duration: 200, easing: quintOut }}
			animate:flip={{ duration: 200, easing: ease }}
			role="button"
			tabindex="-1"
			onpointerdown={() => {
				toasts.splice(index, 1);
			}}
		>
			<div class="toast-title">{toast.text}</div>
			<div class="toast-description">
				{toast.description}
			</div>
			{#each toast.actions as action}
				<button onclick={action.onClick}>{action.label}</button>
			{/each}
		</div>
	{/each}
</div>
