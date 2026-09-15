<script lang="ts">
	import { formatLongDate, futureDate } from "$lib/util";

	interface Props {
		date: Date;
		relative?: boolean;
	}

	let { date = $bindable(), relative = false }: Props = $props();

	let str = $state("␠");
	const intl = new Intl.RelativeTimeFormat(undefined, { style: "short", numeric: "auto" });

	$effect(() => {
		if (relative) {
			const now = new Date();
			const deltaMS = date.getTime() - now.getTime();
			const delta = Math.floor(deltaMS / 1000);
			const abs = Math.abs(delta);

			if (abs < 60) {
				str = "just now";
				setTimeout(update, deltaMS);
			} else if (abs < 60 * 60) {
				str = intl.format(Math.floor(delta / 60), "minute");
				setTimeout(update, 60_000);
			} else if (abs < 60 * 60 * 24) {
				str = intl.format(Math.floor(delta / 60 / 60), "hour");
				setTimeout(update, 3_600_000);
			} else if (date.getUTCFullYear() < now.getUTCFullYear()) {
				str = date.toLocaleDateString(undefined, {
					year: "numeric",
					month: "short",
					day: "numeric",
				});
			} else if (date > futureDate(new Date(), "-1day")) {
				str = "Yesterday";
			} else {
				str = formatLongDate(date);
			}
		} else {
			str = formatLongDate(date);
		}
	});

	const update = () => {
		date = date;
	};
</script>

<time datetime={date.toUTCString()} title={date.toLocaleString()}>{str}</time>
