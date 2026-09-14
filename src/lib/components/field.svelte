<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: Snippet;
		input: Snippet;
		hint?: Snippet;
		class?: string;
		[key: string]: unknown;
	}

	let { label, input, hint, class: className, ...rest }: Props = $props();
</script>

<fieldset class="fieldset {className}" {...rest}>
	<legend class="fieldset-legend">
		{@render label()}
	</legend>
	{@render input()}
</fieldset>
