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

For automatic builds, connect `ChrisDelvalle/steno-drills` to Workers Builds. Use the branch containing the app, Node 24, build command `npm run check && npm run build`, and deploy command `npx wrangler deploy`. Keep the root directory at the repository root. The lockfile pins Wrangler and the app dependencies.

Verify the `*.workers.dev` URL and `https://steno.chrisdelvalle.com`, including direct reloads at `/#/skills`, `/#/words`, `/#/exercises`, and `/#/settings`. Check dictionary loading, license links, response headers, and HTTPS. Hash routes need no server rewrites.

`public/_headers` applies caching and security headers to static assets. Hashed assets are immutable; the unversioned dictionary revalidates. All fonts, code, and data are served from the same origin.

Local storage is per origin. Export a profile from the local site and import it on the production domain to carry your skills and exercises across. Local and production sites do not automatically share data.

Use `npx wrangler rollback` to restore a previous Worker deployment. Export browser data before deploying a future change to the profile schema.

References: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

Deployed on 2026-10-20:

- Production: https://steno.chrisdelvalle.com
- Worker: `steno-drills` at https://steno-drills.irk-us.workers.dev
- Source release: `f860e3784da4ecb952c8f880f9e047a591d14b0d` on `gh-pages`
- Worker version: `1d8e32f4-982c-42ea-aecb-41a2454307b9`
- Verified HTTPS, the live practice flow, hash-route reloads, security/cache headers, and the deployed dictionary's SHA-256 against the local build.
- [GitHub checks passed](https://github.com/ChrisDelvalle/steno-drills/actions/runs/39531242374).

Subsequent releases use `npm run deploy` from an authenticated local checkout. Automatic Worker deployments from GitHub are optional and have not been connected.

Practice refresh deployed on 2026-10-20:

- Source release: `b0484ca98813dbe98284a56c05ada661364ebf86` on `gh-pages`.
- Worker version: `aae53ced-9ad5-4644-a4c5-99f0f65c9380`.
- [GitHub app checks passed](https://github.com/ChrisDelvalle/steno-drills/actions/runs/39541197780): 54 tests, TypeScript, dictionary validation, production build, and Wrangler dry run.
- Verified HTTPS on both domains. Production scripts, stylesheet, dictionary, concept audit, favicon, and notices match the local build by SHA-256. Cloudflare may append its managed challenge script to HTML responses, so app assets are compared separately.
- Verified the ready focused test, saved-profile migration to Skills, total-seconds timer, three complete rows, stable geometry during a 400-character mistake, hints, results with burst and one error event, and no browser console/CSP errors.
- The local Plover default dictionaries match the pinned sources. Every build checks 92 concepts and 117,902 word/outline mappings against main and commands data.

Shared tests and Plover hint fix deployed on 2026-10-21:

- Source release: `66c85bab09d5ff17938ba020d229755822c44159` on `gh-pages`.
- Worker version: `3c96d39f-85fd-41d3-b1d0-9210d1c4b3be`.
- [GitHub app checks passed](https://github.com/ChrisDelvalle/steno-drills/actions/runs/39544446102): 79 tests and all existing release checks.
- Verified the live `#t=ICCA` starter test, settings navigation with the token intact, clipboard copying, and hint advance before a trailing space. Production browser console/CSP checks are clear.
- Production scripts, stylesheet, dictionary, concept audit, and favicon match the local build by SHA-256 over verified HTTPS. No backend or profile-schema migration was added.
- See [sharing format and behavior](sharing.md) for compatibility rules and golden token fixtures.
