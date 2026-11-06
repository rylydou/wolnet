// Starts the production server. Use this instead of running `build/index.js` directly.
//
// The Bun adapter assumes every request came in over HTTPS unless a proxy says otherwise. WolNet is
// usually reached over plain HTTP (`http://truenas:8778`), and then the browser's `Origin` header
// (`http://...`) doesn't match the origin SvelteKit expects (`https://...`). SvelteKit treats that
// as a cross-site request and blocks every form and button in the UI with a 403.
//
// So: read the protocol from `x-forwarded-proto`, and fill that header in as `http` when no proxy
// set it. Anything in front of WolNet that speaks HTTPS (like `tailscale serve`) still sets it to
// `https` itself. A different site still can't fake the browser's `Origin`, so CSRF checks still work.
process.env.PROTOCOL_HEADER ??= "x-forwarded-proto";

// The adapter calls `Bun.serve` as soon as it is imported, so wrap it first. The header is set on
// the incoming request itself rather than on a copy, because Bun only applies per-request settings
// (like the adapter turning off the idle timeout for live updates) to the original request.
const serve = Bun.serve;
Bun.serve = (options) =>
	serve({
		...options,
		fetch(request, server) {
			if (!request.headers.has("x-forwarded-proto")) request.headers.set("x-forwarded-proto", "http");
			return options.fetch.call(this, request, server);
		},
	});

await import("./build/index.js");
