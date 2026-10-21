# Bundled dictionary sources

`sources/sources.lock.json` records exact upstream commits and SHA-256 digests for every vendored source. The data build verifies these digests before doing any processing.

- `plover.json`: Plover default main dictionary, from `opensteno/plover`. Retain `plover.LICENSE` (GPL v2; the project's README identifies GPL v2 or later).
- `cmudict.dict`: Carnegie Mellon Pronouncing Dictionary, from `cmusphinx/cmudict`. Retain `cmudict.LICENSE` with CMU's redistribution conditions.
- `ngsl.json`: 8,438 frequency-ordered forms extracted from this fork's original `TypeJig.WordSets.NGSL_all_forms`. Original Steno Jig attribution and MIT notice remain in the root `LICENSE` and generated notices. This is a fixed common-vocabulary membership/rank list, not a new scrape.

`npm run data:update` is the only network-backed data command. It pins current Plover and CMU revisions; review its diff and licenses before committing an update. NGSL stays at the recorded extraction revision. Run `npm run check` after updating.

`npm run data:build` generates `public/dictionary.json`, `public/sources.lock.json`, and `public/THIRD_PARTY_NOTICES.txt` using only these local files. They are ignored build artifacts; do not hand-edit them. `data:check` verifies reproducibility against the generated files. The production build includes all three artifacts.
