# Steno Drills agent guide

Create a steno practice test by constructing a URL. Return the complete clickable URL to the user. There is no HTTP API to call, account connection, MCP server, or server-side link-generation step.

The browser validates the readable parameters, converts them to the existing compact share link, and opens a ready test. The timer starts on typing or actual audio playback, following the normal practice rules. Do not attempt to type a test on the user's behalf.

## Create a test link

Start with `https://steno.chrisdelvalle.com/#/practice?` and append URL-encoded parameters. Use `URLSearchParams` or equivalent URL encoding. Keep the query after the `#` fragment. Settings are evaluated in the user's browser; fetching a test URL as a web page does not generate or return a compact token.

- [Initial L, common words, all concepts, 60 seconds](https://steno.chrisdelvalle.com/#/practice?concepts=all&focus=initial.l&seconds=60)
- [Starter concepts, 50 words, hints](https://steno.chrisdelvalle.com/#/practice?concepts=starter&count=50&hints=true)
- [Three-word groups, two repetitions, recovery](https://steno.chrisdelvalle.com/#/practice?concepts=all&groupSize=3&repetitions=2&repeatOnError=true&errorRepetitions=3)
- [Hidden-text audio at 1.2×](https://steno.chrisdelvalle.com/#/practice?concepts=all&audio=true&display=hidden&rate=1.2)
- [Raw outline input](https://steno.chrisdelvalle.com/#/practice?concepts=starter&inputMode=steno&requireCorrect=true)
- [A built-in drill mix](https://steno.chrisdelvalle.com/#/practice?exercise=drills&drills=d-%2Fb-%2CshortAndLongA&restricted=false)
- [Vowel chord practice](https://steno.chrisdelvalle.com/#/practice?exercise=chords&keyboardSet=Vowels&count=25)
- [All patterns in the first finger section](https://steno.chrisdelvalle.com/#/practice?exercise=fingers&fingerBook=duo&section=0&pattern=-1&repeats=20&count=25)
- [A short quote](https://steno.chrisdelvalle.com/#/practice?exercise=quotes&quoteLength=short&count=25)
- [Symbol variants](https://steno.chrisdelvalle.com/#/practice?exercise=symbols&symbolVariants=true&count=25)

The [machine-readable catalog](https://steno.chrisdelvalle.com/agent-catalog.json) supplies exact IDs, chords, labels, concept presets, exercise options, and supported numeric values. Use that catalog for choices not shown here. Never invent IDs or use local list/filter identifiers.

## Concepts and focus

`concepts` specifies the complete set of allowed concepts. `focus` requires a particular concept in the qualifying outline; it does not unlock that concept or the other rules needed by the word.

For “practice initial L” without a learning restriction, use `concepts=all&focus=initial.l`. To restrict practice to a lesson, supply its concept IDs or a suitable preset. For example, [short A with initial L and final D](https://steno.chrisdelvalle.com/#/practice?concepts=initial.l%2Cvowel.a%2Cfinal.d&focus=initial.l&hints=true).

Presets are `none`, `single`, `starter`, and `all`. Initials, vowels, finals, special rules, and briefs are separate concepts. Knowing individual keys does not automatically unlock their combinations. The app does not infer a student's saved Skills. It accepts a word when at least one supported outline is explained by the supplied concepts, and displays that qualifying outline in hints. Automatic word filtering currently supports reliably classified single-syllable, single-stroke words; selecting all concepts does not bypass that classification.

## Parameters

Each parameter may occur once. Boolean values are exactly `true` or `false`. Numeric values use decimal notation. Comma-separated lists must use exact catalog IDs; URL-encode their values, including spaces, slashes, ampersands, and other reserved characters.

- `exercise` — Built-in exercise ID. Values: `bank`, `drills`, `chords`, `fingers`, `sentences`, `two-key`, `quotes`, `numbers`, `number-sentences`, `symbols`. Default: `bank`.
- `seconds` — Timed session duration. Cannot be combined with count. Values: `30`, `60`, `90`, `120`, `300`. Default: `60`.
- `count` — Count session. Without seconds or count, use 60 seconds. For fingers, quotes, and two-key, use 25 to select the complete passage. Values: `10`, `25`, `50`, `100`, `250`, `500`. Default: `25`.
- `hints` — Enable chord hints. Hidden audio text still requires explicit reveal. Default: `false`.
- `pool` — Common vocabulary or the eligible dictionary. Values: `common`, `all`. Default: `common`. Exercises: `bank`.
- `concepts` — none, single, starter, all, or comma-separated concept IDs. Requires restricted=true for drills and keyboardSet=selected for chords. Chord exercises omit briefs. Default: `starter`. Exercises: `bank`, `drills`, `chords`.
- `focus` — Require this concept in a qualifying outline. Requires restricted=true for drills. Does not unlock missing concepts. Values: `(empty)`, `initial.s`, `initial.t`, `initial.k`, `initial.p`, `initial.w`, `initial.h`, `initial.r`, `initial.d`, `initial.b`, `initial.l`, `initial.f`, `initial.m`, `initial.n`, `initial.j`, `initial.g`, `initial.v`, `initial.y`, `initial.z`, `initial.qu`, `initial.sh`, `initial.ch`, `initial.th`, `initial.th-voiced`, `initial.st`, `initial.sp`, `initial.sk`, `initial.br`, `initial.fr`, `initial.gr`, `initial.pl`, `initial.bl`, `initial.sl`, `initial.tr`, `initial.dr`, `initial.fl`, `vowel.a`, `vowel.o`, `vowel.e`, `vowel.u`, `vowel.short-i`, `vowel.long-a`, `vowel.long-e`, `vowel.long-i`, `vowel.long-o`, `vowel.long-u`, `vowel.aw`, `vowel.ow`, `vowel.oy`, `vowel.oo`, `vowel.ae`, `final.f`, `final.r`, `final.p`, `final.b`, `final.l`, `final.g`, `final.t`, `final.s`, `final.d`, `final.z`, `final.m`, `final.n`, `final.k`, `final.j`, `final.sh`, `final.ch`, `final.ng`, `final.nk`, `final.ld`, `final.lt`, `final.rt`, `final.nt`, `final.nd`, `final.mp`, `final.ft`, `special.final-v`, `special.final-st`, `special.final-st-f`, `special.final-z-s`, `special.final-th`, `special.final-th-voiced`, `brief.the`, `brief.of`, `brief.to`, `brief.in`, `brief.a`, `brief.is`, `brief.that`, `brief.with`, `brief.be`, `brief.by`, `brief.he`. Default: `(empty)`. Exercises: `bank`, `drills`.
- `minLength` — Minimum word length; must not exceed maxLength. Whole number from 1 to 100. Default: `1`. Exercises: `bank`.
- `maxLength` — Maximum word length. Whole number from 1 to 100. Default: `30`. Exercises: `bank`.
- `inputMode` — Translated text or raw outline input. Values: `text`, `steno`. Default: `text`. Exercises: `bank`, `drills`.
- `groupSize` — Words per practice group. Whole number from 1 to 10. Default: `1`. Exercises: `bank`, `drills`.
- `repetitions` — Correct passes per group. Whole number from 1 to 10. Default: `1`. Exercises: `bank`, `drills`.
- `requireCorrect` — Require correction of submitted mistakes. Default: `false`. Exercises: `bank`, `drills`.
- `repeatOnError` — Enable recovery repetitions after a mistake. Default: `false`. Exercises: `bank`, `drills`.
- `errorRepetitions` — Recovery passes; requires repeatOnError=true. Recovery uses the larger of this and repetitions. Whole number from 1 to 10. Default: `3`. Exercises: `bank`, `drills`.
- `audio` — Enable self-paced audio. Voice selection stays personal. Default: `false`. Exercises: `bank`, `drills`.
- `display` — Audio text presentation; requires audio=true. Values: `full`, `current`, `hidden`. Default: `full`. Exercises: `bank`, `drills`.
- `rate` — Audio speed multiplier; requires audio=true. Values: `0.5`, `0.6`, `0.7`, `0.8`, `0.9`, `1`, `1.1`, `1.2`, `1.3`, `1.4`, `1.5`, `1.6`, `1.7`, `1.8`, `1.9`, `2`. Default: `1`. Exercises: `bank`, `drills`.
- `drills` — Comma-separated built-in drill IDs. An empty value selects an empty mix. Values: `d-/b-`, `-ld/-lt`, `nch`, `-nj`, `ite/ight`, `st/sp`, `AI/OE/EE`, `shortAndLongA`, `oneAndTwoKey`, `oneOrTwoKeys`, `singleStrokeCVC`, `multiStrokeCVC`, `D_SingleSyllable`, `B_SingleSyllable`, `L_SingleSyllable`, `F_SingleSyllable`, `M_SingleSyllable`, `N_SingleSyllable`, `Q_SingleSyllable`, `Y_SingleSyllable`, `J_SingleSyllable`, `V_SingleSyllable`, `SingleSyllable_N`, `SingleSyllable_M`, `CommonBriefs_1_20`, `CommonBriefs_21_40`, `CommonBriefs_41_60`, `CommonBriefs_61_80`, `CommonBriefs_81_100`, `ST words`, `CH words`, `SH words`, `-LD words`, `+LD words`, `-LT words`, `+LT words`, `-RT words`, `+RT words`, `Learn Plover: One Syllable Words`, `Learn Plover: Consonant Clusters`, `Learn Plover: Where's the TRUFT?`, `Learn Plover: Dropping Unstressed Vowels`, `Learn Plover: Inversion`, `Learn Plover: The Fifth Vowel Key`, `Learn Plover: Long Vowel Chords`, `Learn Plover: Diphthong Chords`, `Learn Plover: Vowel Disambiguator Chords`, `Learn Plover: The Missing Keys`, `Learn Plover: The Remaining Missing Letters`, `Learn Plover: Review Through Missing Letters`, `Learn Plover: Digraphs`, `Learn Plover: Review Through Digraphs`, `Learn Plover: Common Compound Clusters`, `Learn Plover: Review Through Common Compound Clusters`, `Learn Plover: Common Briefs 1-20`, `Learn Plover: Common Briefs 21-40`, `Learn Plover: Common Briefs 41-60`, `Learn Plover: Common Briefs 61-80`, `Learn Plover: Common Briefs 81-100`, `Intro: LeftIndex`, `Intro: LeftMiddle`, `Intro: LeftIndexMiddle`, `Intro: LeftRingPinky`, `Intro: Left`. Default: `d-/b-`. Exercises: `drills`.
- `restricted` — Filter built-in word drills by selected concepts. Default: `true`. Exercises: `drills`.
- `keyboardSet` — selected uses concepts; otherwise choose a catalog keyboard set. Values: `selected`, `Left hand`, `Right hand`, `Vowels`, `Left bottom row`, `Left top row`, `Right bottom row`, `Right top row`. Default: `selected`. Exercises: `chords`.
- `fingerBook` — Built-in finger pattern book. Values: `duo`, `technique`. Default: `duo`. Exercises: `fingers`.
- `section` — Zero-based Duo section. Omit for technique. Whole number from 0 to 26. Default: `0`. Exercises: `fingers`.
- `pattern` — Zero-based pattern in the selected section/book; -1 selects all. Whole number from -1 to 25. Default: `0`. Exercises: `fingers`.
- `repeats` — Finger pattern repetitions. Whole number from 1 to 50. Default: `20`. Exercises: `fingers`.
- `quoteLength` — Quote length category. Values: `short`, `medium`, `long`. Default: `medium`. Exercises: `quotes`.
- `symbolVariants` — Include symbol variants. Default: `false`. Exercises: `symbols`.

## Defaults and source rules

An omitted exercise means `bank` (Words). Defaults are Common vocabulary, explicit Starter concepts, 60 seconds, hints off, translated text, one word per group, one repetition, Require correct off, Repeat on error off, and audio off. Finger, quote, and symbol options use the defaults listed above. Supplying `count` selects count mode; otherwise `seconds` selects timed mode. Do not provide both.

For Words, `pool`, word lengths, concepts, and focus are available. For word drills, `restricted=true` applies concepts and focus; `restricted=false` permits the selected drills without concept filtering. Drill IDs go in `drills`, separated by commas; one ID selects one drill, multiple IDs select a mix, and an empty value selects an empty mix. Vocabulary-pool and word-length parameters are only available for Words.

For chords, `keyboardSet=selected` uses concepts, omitting briefs. Other keyboard sets are self-contained and cannot be combined with `concepts`. For fingers, `section` and `pattern` are zero-based; `pattern=-1` selects all patterns in the section. `fingerBook=technique` has one pattern collection and does not accept `section`.

Finger drills, quotes, and two-key sentences use complete passages in count mode. For these sources, `count=25` selects passage mode; it does not truncate the passage to 25 items. Other count-based sources use the specified target count. Counts refer to target words or strokes, not individual repeated attempts. Only Words and word drills support raw input, word groups, repetitions, recovery, Require correct, and audio.

Audio reads a whole group once per attempt. Initial playback requires Space or Play; visible typing can also activate playback. Enter/restart queues playback after half a second, and timing begins at actual playback. Hidden text conceals answers until the user explicitly reveals them. Voice selection remains the user's personal preference and is not included in links. `display` and `rate` require `audio=true`; `errorRepetitions` requires `repeatOnError=true`.

## Validation and privacy

Readable links preserve the same constraints as compact links, not a frozen word sequence or dictionary snapshot. Their settings are temporary until the user explicitly selects Save settings. They do not overwrite learned Skills, appearance, voice preference, saved content, or personal dictionaries. Shared tests use the bundled dictionary and exercises, without personal corrections or exclusions.

Only the parameters above are supported. Personal Skills references, custom lists/text/patterns, dictionary changes, appearance settings, and voice IDs cannot be included. Unknown IDs, unsupported numeric values, duplicate/unknown parameters, contradictory options, options incompatible with the selected source, and fragments exceeding 16 KiB are errors. Never round, guess, or silently replace unsupported settings. A valid selection can contain no matching words; the app will show its normal empty-pool message. Adjust the requested concepts only with the user's intent in mind.

Do not combine readable parameters with `t` or construct a compact binary token yourself. The browser replaces a valid readable link with `#t=...` without reloading or adding a history entry. The existing Share control can then copy that compact link.

## Discovery

This guide is published as [HTML](https://steno.chrisdelvalle.com/agents.html), [Markdown](https://steno.chrisdelvalle.com/agents.md), and [llms.txt](https://steno.chrisdelvalle.com/llms.txt). The homepage advertises it through metadata, structured data, and HTTP Link headers, without adding anything to the visible practice interface. Automatic discovery depends on the client; if the homepage yields little content, open this guide directly. No Markdown content-negotiation header or Cloudflare conversion feature is required.
