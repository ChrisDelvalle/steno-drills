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

Personal exclusions apply to automatic practice and restricted lists. Unrestricted lists deliberately use their exact membership, including unknown or excluded words. Custom text is also unrestricted. Translated Plover input cannot tell the browser which physical outline was used, so the app checks the resulting text and suggests an eligible outline; it does not claim to verify strokes.

## Extending coverage

Add a sound/key rule with a stable concept ID, add positive and negative classifier fixtures, then regenerate the index. Keep ambiguous theory out of automatic practice rather than broadening a base key's meaning. The data build prints coverage, and the Settings page displays it. Source updates are explicit and pinned; no normal build downloads data.
