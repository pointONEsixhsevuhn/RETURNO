# Temporary Cloudflare test link

For a free friend test from Windows, double-click `share-cloudflare.cmd`. It starts the existing Node/SQLite app locally, waits for its health check, then starts a Cloudflare Quick Tunnel. The terminal prints a random `https://….trycloudflare.com` URL; share that URL with testers.

This keeps RETURNO's existing password hashing, API permissions, and database architecture. It does **not** deploy the app to Cloudflare Workers or move its data to D1. The app and SQLite database stay on the computer running the script.

Quick Tunnels are temporary: the computer, RETURNO process, internet connection, and tunnel window must stay running. The URL changes on the next run and stops working when the tunnel exits. It is for testing, not a permanent service. A stable public hostname needs a domain and a named tunnel, while a lasting Cloudflare-hosted Worker would require a separate serverless migration and runtime verification.

Anyone who obtains the URL can reach the app's sign-in and registration pages. Use only test accounts and sample reports while sharing. Do not post real personal details. Stop sharing with Ctrl+C in the tunnel window; the launcher also stops the Node server it started. Existing servers are not stopped by the launcher.

The launcher requires Node.js 24+, `cloudflared` on `PATH`, and the configured project `.env` if email verification is needed. It reads only `PORT` from `.env`; it does not print secrets. For SMTP, the local machine must be able to reach the configured mail service.

Sensitive API requests are limited to 40 per visitor IP per 15 minutes. When launched by this script, RETURNO binds the origin to loopback and trusts Cloudflare's `CF-Connecting-IP` header only in that explicit tunnel mode, so separate tunnel visitors do not share one rate-limit bucket. Other launches ignore proxy-supplied IP headers.
