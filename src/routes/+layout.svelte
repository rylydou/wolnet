<script lang="ts">
	import favicon from "$lib/assets/favicon.svg";
	import { Toaster } from "$lib/common/toasts";
	import "$lib/styles/index.css";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Toaster />

{@render children()}
