# Steno Drills

[steno.chrisdelvalle.com](https://steno.chrisdelvalle.com)

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

The homepage is a ready-to-type test. Start typing; the clock begins on input. Controls fade out while typing, leaving the logo, hint, timer, and words. Move the pointer, touch the page, or press Tab to reveal the controls. Enter restarts during practice or from results, and Escape opens the gear menu. Test settings are saved locally and restored on the next visit.

If the test loses focus, its words blur behind a focus prompt. Click the passage or start typing to resume; the first character is retained. Tab and settings controls keep their normal navigation. In word drills, `?` toggles hints using Plover's existing `H-F` stroke (left H + right F). Question marks remain punctuation in text, symbol, and other exercises that need them. The app does not modify Plover dictionaries or configuration.

Share in Test settings copies a compact link to a ready test. Links carry supported test parameters and explicit concepts, leaving recipients' Skills and appearance unchanged. Shared settings are temporary until Save settings; Exit restores the previous personal test. See [shared tests and the v1 format](docs/sharing.md).

The gear menu contains:

- **Test:** words, named word lessons, raw keys/chords, finger patterns, sentences, quotes, numbers, symbols, and custom text. Choose single keys, starter concepts, Skills, All, or a custom checklist without changing learned skills. Combine named lessons with Custom mix. Hints toggle the outline and keyboard together, before or during practice. Choose 3–8 visible rows, hint position, and independent text and keyboard sizes. Hints default above the test at the large size, with text on the left. The asterisk column and AO/EU gap share the test's centerline, with space separating the initial and final banks.
- **Skills:** learned initials, vowels, finals, sound rules, and briefs. The starter preset contains single keys and the additional chords from the A to Z use case.
- **Word Bank:** the full searchable vocabulary table, alternative outlines, exclusions, length filters, and saved dynamic filters.
- **Exercises:** the restored exercise catalog, personal word lists, saved filters, and outline/pronunciation corrections. Explicit lists keep their membership as skills change.
- **Settings:** themes, backup import/export, source coverage, and exclusions.

Expected words are measured into explicit rows. Only complete active rows render; the active row stays second until the finite passage ends. Expected words determine the typing layout. Incorrect input appears in a fixed-width annotation above the target and can be corrected with backspace or Plover replacements. Long errors shrink to a readable minimum, then truncate; their full value is available on hover. WPM, word accuracy, raw and burst speed, elapsed seconds, a speed/error graph, and missed words appear only after the test. Graph data has an accessible table. Error markers record submissions at their actual times. Their tooltips show the submitted word in red above the expected word, without a timestamp. Burst measures translated characters inserted in the preceding second, expressed as WPM; it does not estimate physical chord rate. Results are kept only for the current session.

Your data is saved in this browser. Export a backup before clearing browser storage or moving to another device or domain. An unreadable saved profile is preserved until you explicitly replace it. There are no accounts, external analytics, or device synchronization.

Use normal Plover translated text for words. Hints advance after a complete matching word, even before Plover supplies the following space. Incomplete words, mistakes, and edits keep the corresponding hint. For raw chord drills, temporarily disable translating dictionaries in Plover so it sends raw outlines, then restore them before word practice. The app checks resulting text; it cannot verify physical chords from translated text. For Symbols, enable Emily’s Symbols with spacing. Sentence, quote, number, symbol, and custom-text practice is unrestricted; the menu labels it accordingly.

## Filtering and coverage

Automatic practice requires an unambiguous one-syllable count and a one-stroke outline whose complete sound/rule analysis uses learned concepts. It does not assume that knowing individual keys implies knowing every chord, or that the same key’s other sound rules have been learned. Briefs unlock explicitly.

At the pinned source revisions: 147,424 Plover entries become 50,734 literal word entries; 2,360 single-syllable words have an explained outline. The starter skills admit 774 words, including **305 common words**. Unknown pronunciation, conflicting syllables, and unsupported theory are kept for inspection, not guessed into beginner practice. Counts are printed by every data build and visible in Settings.

Personal corrections replace metadata locally without altering the sources. Unrestricted custom lists and custom text support broader practice. See [the filtering model](docs/filtering.md) for rules, limits, and how to extend coverage.

## Data and maintenance

The source snapshots, exact upstream commits, license notices, and SHA-256 digests are in [data/sources](data/sources). The existing NGSL frequency list supplies common-vocabulary membership and ranking.

```sh
npm run data:update # Explicitly download and pin new Plover/CMU revisions
npm run check       # Review classification behavior and regenerated coverage
```

Normal builds never download dictionary data. Generated public data and notices are ignored build artifacts. CI runs the same checks and production build from the lockfile. Filtering, scoring, profile validation, app workflows, restored finger patterns, and real dictionary acceptance fixtures have automated tests. Restored exercise content is pinned locally; quote and sentence corpora load as separate static chunks.

## Deploy to Cloudflare

Publish `dist` with Cloudflare Workers Static Assets. Use Node 24 and `npm run deploy`; the checked-in Wrangler configuration associates `steno.chrisdelvalle.com` as the Worker’s custom domain. Hash routes work without server rewrites.

See [the deployment guide](docs/cloudflare.md) for exact setup and data-transfer steps. A normal build stays local; the deploy command uploads the site and applies the custom-domain configuration.

## Attribution

Original Steno Jig: [Joshua I. Grams](https://github.com/JoshuaGrams/steno-jig), MIT notice retained in [LICENSE](LICENSE). Plover and CMUdict retain their own licenses; the build publishes `THIRD_PARTY_NOTICES.txt` with full notices and source revisions. See [data documentation](data/README.md).


Every data build audits all 92 concept chords and 117,902 indexed outlines against the effective pinned Plover main/commands dictionaries. Briefs must translate to their named word; each sound rule must have a real one-syllable dictionary example. The build fails for unsupported concepts, wrong key banks, stale brief mappings, or command collisions. Skills tooltips include generated word/outline examples. Settings links the generated concept audit.

The supplied local default Plover files were checked on 2026-10-20: main.json and commands.json match the pinned official files byte for byte, and user.json is empty. The verification record is in [data/plover-verification.json](data/plover-verification.json). Personal settings files are not read during ordinary builds.
