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

{{parameters}}

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
