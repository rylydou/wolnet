<script lang="ts">
	interface Props {
		value?: string;
		[key: string]: any;
	}

	let { value = $bindable(''), ...rest }: Props = $props();
</script>

<label class="search-input" style="flex: 1;">
	<span>
		<div class="icon-search"></div>
	</span>
	<input type="search" bind:value {...rest} />
</label>
