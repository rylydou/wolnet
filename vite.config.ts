import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "svelte-adapter-bun";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes("node_modules") ? undefined : true),
				experimental: { async: true },
			},

			// The app ships as a standalone Bun server (see `Dockerfile`), so the target is fixed
			// rather than detected. See https://svelte.dev/docs/kit/adapters for other adapters.
			adapter: adapter(),
			experimental: { remoteFunctions: true, explicitEnvironmentVariables: true },
		}),
	],
});
