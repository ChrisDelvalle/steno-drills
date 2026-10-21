# Steno Drills

A static React/TypeScript app for Plover word practice, learned-concept filtering, and custom exercises.

## Run locally

Use Node 24 (`nvm use` reads `.nvmrc`).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Dictionary processing happens automatically before development and production builds, using pinned files already in the repository. No external data services, accounts, or backend are required.

```sh
npm run check   # Generate data, type-check, run tests, verify deterministic data
npm run build   # Generate data and build static files into dist/
npm run preview # Serve the production build locally
```

## Your practice space

- **Practice:** shuffled words, raw keyboard/chord drills, or custom text; timed or count-based sessions with optional outline/keyboard hints. Sessions start on first input and accept Plover backspaces and text replacements.
- **My Skills:** mark initial sounds, vowels, finals, special rules, and individual briefs as learned. The starter preset contains single keys and the additional chords described in the original A to Z use case.
- **Word Bank:** inspect Plover outlines, filter common/full vocabulary and focus concepts, change word length, understand exclusions, and save dynamic exercises.
- **Exercises:** paste named word lists; deduplicate and resolve entries through the dictionary; review unavailable words; add personal outline, syllable, and pronunciation corrections. Lists retain their membership as your skills change.
- **Settings:** light/dark/system themes, validated backup import/export, source coverage, and personal exclusions.

Your data is saved in this browser. Export a backup before clearing browser storage or moving to another device or domain. An unreadable saved profile is preserved until you explicitly replace it. There is no device synchronization or analytics.

Use normal Plover translated text for words. For raw chord drills, temporarily disable translating dictionaries in Plover so it sends raw outlines, then restore them before word practice. The app checks resulting text; it cannot verify physical chords from translated text. In a practice session, Escape returns to setup and Ctrl/Command+Enter restarts.

## Filtering and coverage

Automatic practice requires an unambiguous one-syllable count and a one-stroke outline whose complete sound/rule analysis uses learned concepts. It does not assume that knowing individual keys implies knowing every chord, or that the same key’s other sound rules have been learned. Briefs unlock explicitly.

At the pinned source revisions: 147,424 Plover entries become 50,734 literal word entries; 2,359 single-syllable words have an explained outline. The starter skills admit 774 words, including **305 common words**. Unknown pronunciation, conflicting syllables, and unsupported theory are kept for inspection, not guessed into beginner practice. Counts are printed by every data build and visible in Settings.

Personal corrections replace metadata locally without altering the sources. Unrestricted custom lists and custom text support broader practice. See [the filtering model](docs/filtering.md) for rules, limits, and how to extend coverage.

## Data and maintenance

The source snapshots, exact upstream commits, license notices, and SHA-256 digests are in [data/sources](data/sources). The existing NGSL frequency list supplies common-vocabulary membership and ranking.

```sh
npm run data:update # Explicitly download and pin new Plover/CMU revisions
npm run check       # Review classification behavior and regenerated coverage
```

Normal builds never download dictionary data. Generated public data and notices are ignored build artifacts. CI runs the same checks and production build from the lockfile. Filtering, scoring, profile validation, app workflows, and real dictionary acceptance fixtures have automated tests.

## Deploy to Cloudflare

Publish `dist` with Cloudflare Workers Static Assets. Use Node 24 and `npm run deploy`; the checked-in Wrangler configuration associates `steno.chrisdelvalle.com` as the Worker’s custom domain. Hash routes work without server rewrites.

See [the deployment guide](docs/cloudflare.md) for exact setup and data-transfer steps. A normal build stays local; the deploy command uploads the site and applies the custom-domain configuration.

## Attribution

Original Steno Jig: [Joshua I. Grams](https://github.com/JoshuaGrams/steno-jig), MIT notice retained in [LICENSE](LICENSE). Plover and CMUdict retain their own licenses; the build publishes `THIRD_PARTY_NOTICES.txt` with full notices and source revisions. See [data documentation](data/README.md).
