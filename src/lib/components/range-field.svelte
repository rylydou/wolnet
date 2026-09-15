<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		value: number;
		min: number;
		max: number;
		step?: number;
		label: Snippet;
		unit?: string;
		class?: string;
		[key: string]: unknown;
	}

	let { value = $bindable(0.0), min, max, step, label, unit, class: className, ...rest }: Props = $props();
</script>

<fieldset class="fieldset fieldset-rangefield {className}" {...rest}>
	<legend class="fieldset-legend">
		<div>
			{@render label()}
		</div>
		<label class="input flat compact">
			<input type="number" bind:value />
			<span class="suffix">{unit}</span>
		</label>
	</legend>
	<input type="range" class="range" bind:value {min} {max} {step} />
</fieldset>
