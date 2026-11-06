<script lang="ts">
	import type { Snippet } from "svelte";

	type Props = {
		label: string;
		/** Problems to show under the input. Takes a remote form field's `issues()` as is. */
		issues?: { message: string }[];
		children: Snippet;
	};

	let { label, issues, children }: Props = $props();
</script>

<label class="field">
	<span class="field-label">{label}</span>
	{@render children()}
	{#each issues ?? [] as issue (issue.message)}
		<span class="field-error" role="alert">{issue.message}</span>
	{/each}
</label>
