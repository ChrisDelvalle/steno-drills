# How the learning filter works

The source of truth is standard machine steno in Plover's pinned `main.json`, rather than phonetic shorthand. A word can have several outlines. We preserve them and choose an outline whose complete analysis passes the current skills and focus filter; that same outline becomes the practice hint.

## Rules, sounds, and position

`src/domain/concepts.ts` is the readable rules table. Each row identifies the initial, vowel, final, or memorized brief; its exact keys; its accepted CMU/ARPAbet sound sequences; and whether it belongs to the starter preset. Special rules have their own IDs even when their keys overlap ordinary rules. Sources for the conventions: [Learn Plover sound lessons](https://opensteno.org/learn-plover/lesson-3-english-sounds.html) and [cheat sheet](https://opensteno.org/learn-plover/appendix-cheat-sheet.html).

The parser respects steno order `STKPWHRAO*EUFRPBLGTSDZ`. Initial TK is one D concept; learning T and K does not imply D. Final F for /F/, final F for /V/, and final F for /S T/ are independent concepts. Initial and final consonant clusters also unlock explicitly.

For a one-syllable pronunciation, the classifier splits the phones into onset, vowel nucleus, and coda. Each must match an exact rule with the same keys and phones. An asterisk must be consumed by an explained rule. If several analyses work, any complete learned analysis can qualify. Known briefs bypass phonetic analysis only through their specific word-and-outline concept.

The default short-vowel rules support the conventional basic phonemes listed in the rules table; short O for /AH/ also requires a written O. These are conservative documented mappings, not an English pronunciation guesser. Rhotic vowel transformations, arbitrary asterisk disambiguation, inversions, dropped syllables, affixes, and other advanced transformations are intentionally not inferred. An unexplained outline is marked for review even when all its physical keys are familiar.

## Syllables and uncertainty

CMUdict supplies pronunciations. Syllable counts are the number of vowel phones, with stress digits ignored for rule matching. All known pronunciations must agree on a count of one. Missing or conflicting counts stay out of automatic practice. A single stroke is independently required; `tablet` is excluded even though Plover contains one-stroke outlines for it.

The index includes literal lowercase words and contractions. Commands, formatting/affix translations, phrases, and capitalized translations are omitted. Not every Plover entry is a candidate beginner word.

## Personal data

Personal corrections replace the chosen word's outlines and syllable metadata without mutating bundled data. Supply a CMU/ARPAbet pronunciation for a new word to allow sound-based classification. With a blank pronunciation the bundled one is retained, if available. Providing an outline alone does not certify that its rules are learned. Unexplained words can still be practiced in an explicitly unrestricted list.

Personal exclusions apply to automatic practice and restricted lists. Unrestricted lists deliberately use their exact membership, including unknown or excluded words. Custom text is also unrestricted. Translated Plover input cannot tell the browser which physical outline was used, so the app checks the resulting text and suggests an eligible outline. Optional raw input translates outline text through the effective dictionary, accepting any unambiguous outline for the target word; concept filters still select vocabulary and hints. Neither mode claims to observe physical key presses.

## Extending coverage

Add a sound/key rule with a stable concept ID, add positive and negative classifier fixtures, then regenerate the index. Keep ambiguous theory out of automatic practice rather than broadening a base key's meaning. The data build prints coverage, and the Settings page displays it. Source updates are explicit and pinned; no normal build downloads data.

## Practice selections

Practice and Word Bank share a concept selector. **Single keys** selects only position-specific single-key sound concepts. **Starter** uses the original starter defaults. **Skills** follows the current learned profile. **All** explicitly selects all supported rules and briefs; unexplained outlines still do not qualify. **Custom** stores an independent checklist seeded from the previous selection. Changing practice selections never edits learned skills.

Skills provides global Select all and Clear actions beside Use starter, in addition to each section's actions. Test settings groups exercise, session, repetition, and audio controls, with appearance controls under Display. Reset defaults restores Words, Common vocabulary, personal Skills, and the default session/display options. It retains learned Skills, voice preference, lists, saved filters, corrections, exclusions, and authored text/patterns.

Named word lessons and personal lists use this filter by default. Turning off “Filter by concepts” makes their fixed membership unrestricted. Saved filters store criteria and expand with Skills; explicit lists keep their membership. Legacy single-focus filters still work and can be cleared in the selector.

The homepage remembers the exercise source and all exercise parameters, alongside concept selection and session length. Older version 1 backups receive defaults for the new parameters during validation, including three rows, hints above the test, and large hint text and keyboard sizes. Malformed backups remain atomic failures and never replace current data.


## Source audit

The Plover main dictionary supplies exact translations, and its default command dictionary takes precedence when extracting literal practice words. Each build checks all 117,902 retained word/outline mappings. Every concept chord must parse in its declared key bank, every brief must translate to its exact named word, and every rule must have an explained single-syllable source example. Unsupported concepts fail the build.

The audit corrected the former be brief from PW (about) to -B (be). The unused final-S-on--F rule had no supporting dictionary examples and was removed; older backups migrate that obsolete selection away. Initial J remains SKWR and final J remains -PBLG. Asterisks in alternative outlines are separate disambiguation rules and are not automatically unlocked by knowing the initial consonant.

The dictionary does not encode phonetic theory or syllable counts. CMUdict and the explicit rules table remain necessary; source matching verifies outlines and translations without guessing theory for unexplained entries.

The vowel labels Short A, Short O, Short E, and Short U follow [Learn Plover’s short-vowel terminology](https://opensteno.org/learn-plover/lesson-1-fingers-and-keys.html). The keys remain A, O, E, and U; existing skill selections do not change.
