# Publish at steno.chrisdelvalle.com

Steno Drills uses Cloudflare Workers Static Assets. Wrangler uploads `dist` directly; no Worker script, backend, runtime secrets, or Pages project is needed.

The checked-in `wrangler.jsonc` names the Worker `steno-drills` and associates `steno.chrisdelvalle.com` as a Worker Custom Domain. Cloudflare manages its DNS record and certificate in the active `chrisdelvalle.com` zone.

```sh
npm ci
npm run check
npm run build
npm run deploy:check
npx wrangler login
npm run deploy
```

Wrangler uses the authenticated account. If multiple accounts are available, select the account managing `chrisdelvalle.com` or set `CLOUDFLARE_ACCOUNT_ID` in the deployment environment. Never commit credentials. The deploy command builds before uploading.

For automatic builds, connect `ChrisDelvalle/steno-jig` to Workers Builds. Use the branch containing the app, Node 24, build command `npm run check && npm run build`, and deploy command `npx wrangler deploy`. Keep the root directory at the repository root. The lockfile pins Wrangler and the app dependencies.

Verify the `*.workers.dev` URL and `https://steno.chrisdelvalle.com`, including direct reloads at `/#/skills`, `/#/words`, `/#/exercises`, and `/#/settings`. Check dictionary loading, license links, response headers, and HTTPS. Hash routes need no server rewrites.

`public/_headers` applies caching and security headers to static assets. Hashed assets are immutable; the unversioned dictionary revalidates. All fonts, code, and data are served from the same origin.

Local storage is per origin. Export a profile from the local site and import it on the production domain to carry your skills and exercises across. Local and production sites do not automatically share data.

Use `npx wrangler rollback` to restore a previous Worker deployment. Export browser data before deploying a future change to the profile schema.

References: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
