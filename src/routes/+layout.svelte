<script lang="ts">
	import favicon from "#lib/assets/images/favicon.png";
	import Toaster from "#lib/components/toaster.svelte";
	import "#lib/styles/index.css";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Toaster />

{@render children()}
