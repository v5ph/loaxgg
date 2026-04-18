# loaxgg

Static Vite site with Cloudflare deployment via Wrangler.

## Cloudflare

Install dependencies with `npm install`, then authenticate once with `npx wrangler login`.

Use `npm run preview:cf` to build the site and serve the production `dist/` output through Wrangler locally.

Use `npm run deploy` to build and deploy the same static assets to Cloudflare.
