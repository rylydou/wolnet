<script lang="ts">
	import { Toggle } from ".";

	interface Props {
		value?: string;
		reveal_password?: boolean;
		[key: string]: any;
	}

	let { value = $bindable(""), reveal_password = $bindable(false), ...rest }: Props = $props();
</script>

<div class="relative tooltip-trigger">
	<input
		type={reveal_password ? "text" : "password"}
		class="input input-password w-full h-full pr-10"
		placeholder={reveal_password ? "Password will be visible!!" : "Password will be hidden"}
		bind:value
		{...rest}
	/>

	<Toggle class="btn" bind:value={reveal_password}>
		{#snippet on()}
			<div class="icon-unlock color-primary"></div>
		{/snippet}
		{#snippet off()}
			<div class="icon-lock"></div>
		{/snippet}

		{#snippet children()}
			<div class="tooltip">
				{reveal_password ? "Hide password" : "Show password"}
			</div>
		{/snippet}
	</Toggle>
</div>
