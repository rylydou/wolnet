import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	server: { port: 8778 },
	build: {
		// Bake the pixel fonts into the CSS, so text never shows up in a fallback font while they load.
		assetsInlineLimit: (file) => (file.endsWith(".ttf") ? true : undefined),
	},
	plugins: [
		sveltekit({
			adapter: adapter({
				serverOptions: {
					// The default when PORT isn't set.
					port: 8778,
					// A wake request waits for the device to boot (see `/api/wake`), so connections may sit
					// quiet for minutes. 255 seconds is the most Bun allows.
					idleTimeout: 255,
				},
			}),
			compilerOptions: { experimental: { async: true } },
			experimental: { remoteFunctions: true },
		}),
	],
});
