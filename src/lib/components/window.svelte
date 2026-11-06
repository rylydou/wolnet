<script lang="ts">
	import type { Snippet } from "svelte";

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="window">
	<header class="window-titlebar">{title}</header>
	<div class="window-content">
		{@render children()}
	</div>
</section>
