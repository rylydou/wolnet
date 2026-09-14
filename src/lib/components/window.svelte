<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		windowTitle: Snippet;
		children: Snippet;
		class?: string;
		[key: string]: unknown;
	}

	let { children, windowTitle, class: className, ...rest }: Props = $props();
</script>

<div class="window_frame {className}" {...rest}>
	<div class="window_titlebar">
		{@render windowTitle()}
	</div>
	<div class="window_content">
		{@render children()}
	</div>
</div>
