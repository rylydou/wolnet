<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		label: Snippet;
		input: Snippet;
		hint?: Snippet;
		/** Validation problems to show beneath the input. Shaped to accept a remote form's `issues()` directly. */
		issues?: { message: string }[];
		class?: string;
		[key: string]: unknown;
	}

	let { label, input, hint, issues, class: className, ...rest }: Props = $props();

	const uid = $props.id();
	const anchor = `--field-${uid}`;

	let hintEl: HTMLElement | undefined = $state();
</script>

<fieldset
	class="fieldset {className}"
	style:anchor-name={hint ? anchor : null}
	onfocusin={() => hintEl?.showPopover()}
	onfocusout={() => hintEl?.hidePopover()}
	{...rest}
>
	<legend class="fieldset-legend">
		{@render label()}
	</legend>
	{@render input()}
	{#each issues ?? [] as issue (issue.message)}
		<p class="fieldset-error" role="alert">{issue.message}</p>
	{/each}
	{#if hint}
		<p bind:this={hintEl} class="fieldset-hint" popover="manual" style:position-anchor={anchor}>
			{@render hint()}
		</p>
	{/if}
</fieldset>
