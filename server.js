// Entry point for the production server, in place of the adapter's own `build/index.js`.
//
// `svelte-adapter-bun` has to guess the origin it is serving on, and with no TLS to inspect and no
// reverse proxy to ask it assumes `https://<host header>`. Over plain HTTP that guess is wrong, and
// SvelteKit then rejects every form submission and remote-function call as cross-site with a 403 -
// adding, waking and deleting a device all stop working. Remote functions compare the `Origin`
// header against the server's origin unconditionally, so `csrf.trustedOrigins` cannot relax it and
// the adapter's `ORIGIN` would pin the app to a single name.
//
// Instead, tell the adapter to read the protocol from `x-forwarded-proto` and supply that header
// ourselves when nothing upstream did. The origin is then derived from the request's own `Host`,
// so the app answers to whatever name points at it - hostname, IP, Tailscale name - and the
// cross-site check keeps working, because a foreign `Origin` still fails to match.
process.env.PROTOCOL_HEADER ??= "x-forwarded-proto";

// The adapter builds its server options and calls `Bun.serve` at import time, so wrapping the
// handler means intercepting that call. Going through the adapter's own entry point this way keeps
// its port, body-limit, WebSocket and graceful-shutdown handling rather than restating it here.
const serve = Bun.serve;

Bun.serve = (options) => {
	const handler = options.fetch;

	return serve({
		...options,
		fetch(request, server) {
			// A real proxy in front of us has already said what the browser spoke; only fill in the
			// header when it is absent, so terminating TLS upstream keeps working.
			if (!request.headers.has("x-forwarded-proto")) {
				const headers = new Headers(request.headers);
				headers.set("x-forwarded-proto", "http");
				request = new Request(request, { headers });
			}

			return handler(request, server);
		},
	});
};

await import("./build/index.js");
