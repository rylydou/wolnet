<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		value?: boolean;
		on?: Snippet;
		off?: Snippet;
		children?: Snippet;
		[key: string]: any;
	}

	let { value = $bindable(false), on, off, children, ...rest }: Props = $props();
</script>

<button type="button" class="toggle" onclick={() => (value = !value)} {...rest}>
	{#if value}
		{#if on}
			{@render on()}
		{:else}
			On
		{/if}
	{:else if off}
		{@render off()}
	{:else}
		Off
	{/if}
	{@render children?.()}
</button>
