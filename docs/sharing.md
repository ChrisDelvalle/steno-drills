# Shared tests

In Test settings, choose the exercise and parameters, then select Share. The URL opens immediately into a ready test. Shared settings stay in the URL, separate from the student's profile. Save settings copies test parameters into personal defaults; Exit restores the previous personal test. Appearance controls still use personal preferences. Shared tests always use bundled content, without personal corrections or exclusions.

Custom word lists, custom text, and custom finger patterns cannot be shared. Saved filters can be shared because their criteria and selected concepts are resolved into the link, without their local IDs or names. Links preserve constraints rather than a fixed word sequence or vocabulary snapshot.

## V1 wire format

The canonical practice fragment is `#t=<token>`; settings use `#/test-settings?t=<token>`. Other hash screens preserve `t` alongside their ordinary parameters. The token uses `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_`, with bits written most-significant first into six-bit groups. Only the last group receives zero padding. This is a direct bitstream using the Base64url alphabet, not a byte-aligned Base64 encoding.

Header: version 1 in 3 bits, source ID in 4 bits, session ID in 4 bits, hints in 1 bit. Source IDs and all other wire tables live in `src/domain/shareCatalog.ts`; those tables are immutable v1 definitions, independent of UI order. Session IDs 0–4 select 30/60/90/120/300 seconds; 5–10 select 10/25/50/100/250/500 words. Count-mode passages that ignore word count normalize that inactive setting to 25.

Source payloads, in order:

- Words: dictionary-pool bit, nondefault-range bit, concept subset, focus-present bit and optional 7-bit focus ID, then optional 13-bit range rank. Default pool is common and default range is 1–30.
- Drills: mix bit; a single drill has a 6-bit ID, while a mix uses the drill subset codec. Then a restricted bit and, when restricted, the concept subset and optional focus.
- Chords: 3-bit keyboard preset ID. Selected concepts additionally carry a subset over the 81 non-brief concepts, preserving the relative order of the v1 concept table.
- Fingers: book bit (Dueling Digit Duo / Technique 1A); Duo additionally carries a 5-bit section. Pattern 0 means all, otherwise index + 1, using the minimum fixed width for that section. Repeat IDs 0–2 mean 5/10/20. ID 3 carries a following 6-bit repeat count from 1–50, including the UI's 50 option. V1 finger pattern definitions are frozen with the catalogs.
- Quotes: 2-bit short/medium/long selection.
- Symbols: variants bit.
- Sentences, two-key sentences, numbers, and number sentences: no source payload.

Length ranges enumerate all 5,050 pairs with 1 <= minimum <= maximum <= 100. The zero-based rank is `101*(minimum-1) - minimum*(minimum-1)/2 + maximum-minimum`.

## Subsets

A 2-bit tag selects exact preset (0), preset delta (1), or full bitmap (2); tag 3 is invalid. Concept baselines are empty, single keys, starter, and all. Drill baselines are empty and all. Baselines use the minimum fixed ID width.

An exact preset ends after its ID. A delta carries its baseline ID, a positive Elias gamma encoded change count, then a fixed-width combinatorial rank of the changed indices. Counts cannot exceed half the catalog; empty/all baselines ensure a qualifying candidate always exists. Sorted changed indices x[0..k-1] use colex rank `sum(C(x[i], i+1))`, requiring `ceil(log2(C(n,k)))` bits. Applying the delta toggles those entries. A bitmap stores one bit per entry.

The encoder compares bit costs and chooses the shortest representation. Ties prefer exact preset, delta, then bitmap, with lower baseline IDs first. A single drill always uses its dedicated ID. Changes to inactive editor selections do not enlarge the URL; an in-memory draft keeps those controls usable until reload.

## Compatibility and validation

Do not reorder or repurpose any v1 wire ID or change its preset definitions. Add a new format version for incompatible additions. Golden token fixtures and catalog checks guard compatibility. Current presets may label an identical explicit selection in the UI; a changed preset falls back to Custom, preserving the encoded concepts.

Decode returns a typed success/error result. It rejects unsupported versions, non-alphabet characters, tokens outside 2–128 characters, truncation, out-of-range options, invalid subset ranks/counts, and more than five trailing bits or nonzero padding. Invalid links show an error and Open practice; no substitute test is started silently. Decoder loops are bounded by the frozen catalog sizes.

Verified token sizes: starter/60 seconds `ICCA` (4 characters); starter plus initial V `ICGjw` (5). Arbitrary concepts fit within 19; focus and word-length limits within 22; a drill mix plus concepts and focus within 31. Production URLs add 35 characters. No runtime services or compression dependencies are used.

The codec tests exhaust small subset catalogs, all 5,050 length ranges, all built-in drills and finger patterns, session options, real-catalog randomized selections, malformed tokens, golden fixtures, and the length bounds. App tests cover fresh users, personal-data isolation, reload/navigation, save/exit, assistance toggles, clipboard fallback, and invalid links.

## V2 word practice

V2 reuses the complete v1 source payload and appends six bits: raw-input flag (1), Require correct flag (1), and repetitions minus one (4, valid values 0–9). It is supported for Words and word drills, including saved filters resolved to Words. Unsupported sources and reserved repeat values are rejected. No visual settings or personal dictionary data are encoded. The encoder emits v1 when word options are at their defaults, so all existing v1 fixtures and size bounds remain unchanged. Nondefault word options add exactly one character.

The fixed fixture `QCCZA` means starter concepts, 60 seconds, hints off, raw steno, three repetitions, and Require correct. Old v1 links explicitly select translated text, one repetition, and Require correct off, independently of the recipient's personal defaults. Editing, reloading, saving, and exiting v2 links follow the same profile isolation rules as v1.

## V3 error recovery

V3 preserves the v1 source payload and v2 word options, then adds a 4-bit error repetition count (1–10). Its presence enables Repeat on error; zero and values 11–15 are invalid. Recovery uses the larger of this count and the normal repetition count. Only Words and word drills support the extension. The encoder continues to emit the original v1/v2 tokens when recovery is disabled, ignoring its inactive count.

Fixed fixtures: `YCCAG` is starter concepts, 60 seconds, hints off, translated text, one normal repetition, Require correct off, and three error repetitions. `YCCZG` additionally selects raw input, three normal repetitions, and Require correct. V1/v2 links explicitly disable recovery, regardless of the recipient's profile. Live attempt history and streak-reset anchors are local to the current session and are never shared or backed up. Settings retain the existing reload, edit, Save settings, and Exit behavior.
