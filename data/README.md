# Bundled dictionary sources

`sources/sources.lock.json` records exact upstream commits and SHA-256 digests for every vendored source. The data build verifies these digests before doing any processing.

- `plover.json`: Plover default main dictionary, from `opensteno/plover`. Retain `plover.LICENSE` (GPL v2; the project's README identifies GPL v2 or later).
- `plover-commands.json`: the 37 default Plover command mappings, pinned at the same revision as main.json. Commands are applied before literal-word extraction so control chords cannot become practice hints.
- `cmudict.dict`: Carnegie Mellon Pronouncing Dictionary, from `cmusphinx/cmudict`. Retain `cmudict.LICENSE` with CMU's redistribution conditions.
- `ngsl.json`: 8,438 frequency-ordered forms extracted from this fork's original `TypeJig.WordSets.NGSL_all_forms`. Original Steno Jig attribution and MIT notice remain in the root `LICENSE` and generated notices. This is a fixed common-vocabulary membership/rank list, not a new scrape.

`npm run data:update` is the only network-backed dictionary command. It pins current Plover and CMU revisions; review its diff and licenses before committing an update. NGSL stays at the recorded extraction revision. Run `npm run check` after updating.

`npm run data:build` generates `public/dictionary.json`, `public/sources.lock.json`, `public/concept-audit.json`, and `public/THIRD_PARTY_NOTICES.txt` using only these local files. They are ignored build artifacts; do not hand-edit them. `data:check` verifies reproducibility against the generated files. The production build includes all four artifacts.

## Restored exercises

`data/exercises.json`, `data/sentences.json`, and `data/quotes.json` are pinned extractions from the original Steno Jig commit recorded in `sources.lock.json`. They include named word drills, Learn Plover and intro lessons, all 27 Dueling Digit Duo sections, Stenotype Finger Technique 1A, two-key sentences, a 4,789-sentence Gutenberg selection, and 1,000 attributed English quotes. Quote and sentence corpora are separate lazy-loaded assets; normal builds do not download them.

`scripts/import-exercises.mjs` reproduces the extraction from the preserved original Git revision. It runs only as an explicit maintenance operation. A Node VM reads the legacy data with a timeout and no filesystem or network capabilities. No legacy scripts run in the app. An ambiguous `TWRS/SPHRO` finger pattern is recorded as omitted; unambiguous right-bank dashes are normalized. The Symbols generator retains Emily’s Symbols mapping and fixes an inconsistent closing-bracket label; it requires that optional Plover dictionary.

The original MIT notice remains. The quote collection retains source attribution and the bundled Monkeytype GPLv3 notice in `sources/monkeytype.LICENSE`. The build also publishes the Roboto Mono OFL and Chart.js MIT notices from the lockfile-pinned packages. Fonts and charts are served locally.


The generated audit checks every indexed word/outline against Plover’s translation and requires source-backed examples for every concept. The supplied local main and command dictionaries are byte-identical to the pinned official sources; data/plover-verification.json records their hashes without personal filesystem paths. The empty user dictionary is not bundled.
