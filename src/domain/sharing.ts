import type { Filter, Profile, WordPracticeOptions, ListeningOptions } from './types';
import { defaultFilter, defaultPractice } from './profile';
import { selectedConcepts } from './vocabulary';
import { fingerSections, techniqueSections } from './exercises';
import { shareCatalog as v1 } from './shareCatalog';
import { wordPracticeDefaults, assistedPractice } from './wordPractice';
import { listeningDefaults, speechRates, validateListening } from './listening';
import { BitReader, BitWriter, readSet, writeSet } from './shareBits';

export type ShareResult<T> = { ok: true; value: T } | { ok: false; error: string };
type SharedConcepts = { concepts: string[]; focus: string };
type SharedFilter = SharedConcepts & { pool: 'common' | 'all'; minLength: number; maxLength: number };
type SharedSession = { mode: 'timed'; duration: number } | { mode: 'count'; count: number };
type SharedBase = { version: 1 | 2 | 3 | 4 | 5; listening?: ListeningOptions; session: SharedSession; hints: boolean; wordPractice?: WordPracticeOptions };
export type SharedTest = SharedBase & (
  { source: 'bank'; filter: SharedFilter } |
  { source: 'drills'; drills: string[]; filter: SharedConcepts | null } |
  { source: 'chords'; keys: string; concepts: string[] } |
  { source: 'fingers'; book: 'duo' | 'technique'; section: number; pattern: number; repeats: number } |
  { source: 'quotes'; length: 'short' | 'medium' | 'long' } |
  { source: 'symbols'; variants: boolean } |
  { source: 'sentences' | 'two-key' | 'numbers' | 'number-sentences' }
);
const chordIds = v1.concepts.filter(id => !id.startsWith('brief.'));
const conceptIds = (chords = false): readonly string[] => chords ? chordIds : v1.concepts;
const presets = (ids: readonly string[]) => v1.conceptPresets.map(preset => preset.flatMap(id => ids.includes(id) ? [ids.indexOf(id)] : []));
const drillPresets = [[], v1.drills.map((_, i) => i)];
const width = (choices: number) => Math.ceil(Math.log2(choices));
const index = <T,>(items: readonly T[], value: T) => {
  const i = items.indexOf(value);
  if (i < 0) throw new Error('This setting is not supported by shared links.');
  return i;
};
const bounded = (value: number, min: number, max: number) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid test setting.');
  return value;
};
const flag = (value: boolean) => {
  if (typeof value !== 'boolean') throw new Error('Invalid test toggle.');
  return value ? 1 : 0;
};
function checkWordOptions(options: WordPracticeOptions) {
  if (options.inputMode !== 'text' && options.inputMode !== 'steno') throw new Error('Invalid input mode.');
  bounded(options.repetitions, 1, 10); flag(options.requireCorrect);
  flag(options.repeatOnError); bounded(options.errorRepetitions, 1, 10); bounded(options.groupSize, 1, 10);
}
const canonicalIds = (ids: string[], catalog: readonly string[]) => [...new Set(ids)].map(id => index(catalog, id)).sort((a, b) => a - b).map(i => catalog[i]);
const patterns = (book: 'duo' | 'technique', section: number): readonly string[] => {
  if (book === 'technique') return v1.techniquePatterns;
  return v1.fingerSections[bounded(section, 0, v1.fingerSections.length - 1)];
};

/** Snapshot only the parameters that affect this test, never profile IDs or personal dictionary data. */
export function normalizeSharedTest(profile: Profile): ShareResult<SharedTest> {
  try {
    const p = profile.practice;
    const saved = profile.exercises.find(e => `filter:${e.id}` === p.source);
    const source = p.source.startsWith('filter:') && saved ? 'bank' : p.source;
    if (source === 'text' || source.startsWith('list:')) throw new Error('Sharing supports built-in exercises.');
    const filter = saved?.filter || profile.filter;
    const concepts = () => canonicalIds(selectedConcepts(filter, profile.learned), v1.concepts);
    const focused = (): SharedConcepts => ({ concepts: concepts(), focus: filter.focus });
    const session: SharedSession = profile.session.mode === 'timed' ? { mode: 'timed', duration: profile.session.duration } :
      { mode: 'count', count: ['fingers', 'quotes', 'two-key'].includes(source) ? 25 : profile.session.count };
    const wordPractice: WordPracticeOptions = source === 'bank' || source === 'drills' ? { inputMode: profile.session.inputMode, groupSize: profile.session.groupSize, repetitions: profile.session.repetitions, requireCorrect: profile.session.requireCorrect, repeatOnError: profile.session.repeatOnError, errorRepetitions: profile.session.repeatOnError ? profile.session.errorRepetitions : 3 } : wordPracticeDefaults();
    checkWordOptions(wordPractice);
    const listening = source === 'bank' || source === 'drills' ? validateListening(profile.session.listening) : listeningDefaults();
    const base: SharedBase = { ...(listening.enabled ? { listening } : {}), version: listening.enabled ? 5 : wordPractice.groupSize > 1 ? 4 : wordPractice.repeatOnError ? 3 : assistedPractice(wordPractice) ? 2 : 1, session, hints: profile.session.hints, ...(assistedPractice(wordPractice) ? { wordPractice } : {}) };
    let test: SharedTest;
    switch (source) {
      case 'bank': test = { ...base, source, filter: { ...focused(), pool: filter.pool, minLength: filter.minLength, maxLength: filter.maxLength } }; break;
      case 'drills': test = { ...base, source, drills: canonicalIds(p.drill === 'custom' ? p.mixed : [p.drill], v1.drills), filter: p.restricted ? focused() : null }; break;
      case 'chords': test = { ...base, source, keys: p.keyboardSet, concepts: p.keyboardSet === 'selected' ? concepts().filter(id => !id.startsWith('brief.')) : [] }; break;
      case 'fingers': {
        if (p.fingerBook === 'custom') throw new Error('Sharing supports built-in finger patterns.');
        const currentPatterns = p.fingerBook === 'duo' ? fingerSections[p.section] : techniqueSections['1A'];
        const section = p.fingerBook === 'duo' ? v1.fingerSections.findIndex(s => JSON.stringify(s) === JSON.stringify(currentPatterns)) : 0;
        if (!currentPatterns || section < 0) throw new Error('This pattern set is not supported by shared links.');
        const pattern = p.pattern === -1 ? -1 : index(patterns(p.fingerBook, section), currentPatterns[p.pattern]);
        test = { ...base, source, book: p.fingerBook, section, pattern, repeats: p.repeats }; break;
      }
      case 'quotes': test = { ...base, source, length: p.quoteLength }; break;
      case 'symbols': test = { ...base, source, variants: p.symbolVariants }; break;
      case 'sentences': case 'two-key': case 'numbers': case 'number-sentences': test = { ...base, source }; break;
      default: throw new Error('Sharing supports built-in exercises.');
    }
    // The same bounded codec validates snapshots and incoming data.
    encodeSharedTest(test);
    return { ok: true, value: test };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'This test cannot be shared.' }; }
}
function writeConcepts(writer: BitWriter, selection: string[], chords = false) {
  const ids = conceptIds(chords);
  writeSet(writer, canonicalIds(selection, ids).map(id => ids.indexOf(id)), ids.length, presets(ids));
}
function readConcepts(reader: BitReader, chords = false) {
  const ids = conceptIds(chords);
  return readSet(reader, ids.length, presets(ids)).map(i => ids[i]);
}
function writeFocus(writer: BitWriter, focus: string) {
  writer.write(focus ? 1 : 0, 1);
  if (focus) writer.write(index(v1.concepts as readonly string[], focus), 7);
}
function readFocus(reader: BitReader) {
  if (!reader.read(1)) return '';
  const focus = v1.concepts[reader.read(7)];
  if (!focus) throw new Error('Invalid focus concept.');
  return focus;
}
export function rangeRank(min: number, max: number) {
  bounded(min, 1, 100); bounded(max, min, 100);
  return (min - 1) * 101 - min * (min - 1) / 2 + max - min;
}
export function rangeUnrank(rank: number) {
  bounded(rank, 0, 5049);
  let min = 1;
  while (rank >= 101 - min) { rank -= 101 - min; min++; }
  return { minLength: min, maxLength: min + rank };
}

/** V1–V5: MSB first; direct six-bit URL alphabet; no JSON, byte padding, or compression. */
export function encodeSharedTest(test: SharedTest): string {
  const w = new BitWriter();
  if (test.version !== 1 && test.version !== 2 && test.version !== 3 && test.version !== 4 && test.version !== 5) throw new Error('Unsupported test link version.');
  const options = test.wordPractice || wordPracticeDefaults();
  const listening = validateListening(test.listening);
  const extended = assistedPractice(options) || listening.enabled;
  if (extended && test.source !== 'bank' && test.source !== 'drills') throw new Error('Word options require a word exercise.');
  checkWordOptions(options);
  w.write(listening.enabled ? 5 : options.groupSize > 1 ? 4 : options.repeatOnError ? 3 : extended ? 2 : 1, 3); w.write(index(v1.sources as readonly string[], test.source), 4);
  w.write(test.session.mode === 'timed' ? index(v1.durations as readonly number[], test.session.duration) : 5 + index(v1.counts as readonly number[], test.session.count), 4);
  w.write(flag(test.hints), 1);
  switch (test.source) {
    case 'bank': {
      const f = test.filter, range = f.minLength !== 1 || f.maxLength !== 30;
      w.write(index(['common', 'all'], f.pool), 1); w.write(range ? 1 : 0, 1);
      writeConcepts(w, f.concepts); writeFocus(w, f.focus);
      if (range) w.write(rangeRank(f.minLength, f.maxLength), 13);
      break;
    }
    case 'drills': {
      const ids = canonicalIds(test.drills, v1.drills).map(id => v1.drills.indexOf(id as typeof v1.drills[number]));
      w.write(ids.length === 1 ? 0 : 1, 1);
      if (ids.length === 1) w.write(ids[0], 6); else writeSet(w, ids, v1.drills.length, drillPresets);
      w.write(test.filter ? 1 : 0, 1);
      if (test.filter) { writeConcepts(w, test.filter.concepts); writeFocus(w, test.filter.focus); }
      break;
    }
    case 'chords':
      w.write(index(v1.keyboards as readonly string[], test.keys), 3);
      if (test.keys === 'selected') writeConcepts(w, test.concepts, true);
      break;
    case 'fingers': {
      w.write(index(['duo', 'technique'], test.book), 1);
      if (test.book === 'duo') w.write(bounded(test.section, 0, 26), 5);
      const rows = patterns(test.book, test.section);
      w.write(bounded(test.pattern, -1, rows.length - 1) + 1, width(rows.length + 1));
      const repeat = [5, 10, 20].indexOf(test.repeats);
      w.write(repeat < 0 ? 3 : repeat, 2);
      if (repeat < 0) w.write(bounded(test.repeats, 1, 50), 6);
      break;
    }
    case 'quotes': w.write(index(v1.quoteLengths, test.length), 2); break;
    case 'symbols': w.write(flag(test.variants), 1); break;
  }
  if (extended) { w.write(options.inputMode === 'steno' ? 1 : 0, 1); w.write(flag(options.requireCorrect), 1); w.write(options.repetitions - 1, 4); }
  if (options.groupSize > 1 || listening.enabled) { w.write(options.repeatOnError ? options.errorRepetitions : 0, 4); w.write(options.groupSize - 1, 4); }
  else if (options.repeatOnError) w.write(options.errorRepetitions, 4);
  if (listening.enabled) { w.write(index(['full', 'current', 'hidden'], listening.display), 2); w.write(index(speechRates as readonly number[], listening.rate), 4); }
  return w.token();
}
export function decodeSharedTest(token: string): ShareResult<SharedTest> {
  try {
    const r = new BitReader(token);
    const version = r.read(3);
    if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5) return { ok: false, error: 'Unsupported test link version.' };
    const source = v1.sources[r.read(4)], sessionId = r.read(4);
    if (!source || sessionId > 10) throw new Error('Invalid test settings.');
    const base: SharedBase = { version, session: sessionId < 5 ? { mode: 'timed', duration: v1.durations[sessionId] } : { mode: 'count', count: v1.counts[sessionId - 5] }, hints: Boolean(r.read(1)) };
    let test: SharedTest;
    switch (source) {
      case 'bank': {
        const pool = r.read(1) ? 'all' : 'common', range = r.read(1);
        const concepts = readConcepts(r), focus = readFocus(r);
        const lengths = range ? rangeUnrank(r.read(13)) : { minLength: 1, maxLength: 30 };
        test = { ...base, source, filter: { pool, ...lengths, concepts, focus } }; break;
      }
      case 'drills': {
        const ids = r.read(1) ? readSet(r, v1.drills.length, drillPresets) : [r.read(6)];
        test = { ...base, source, drills: ids.map(i => v1.drills[i]), filter: r.read(1) ? { concepts: readConcepts(r), focus: readFocus(r) } : null }; break;
      }
      case 'chords': {
        const keys = v1.keyboards[r.read(3)];
        test = { ...base, source, keys, concepts: keys === 'selected' ? readConcepts(r, true) : [] }; break;
      }
      case 'fingers': {
        const book = r.read(1) ? 'technique' : 'duo', section = book === 'duo' ? r.read(5) : 0;
        const rows = patterns(book, section), pattern = r.read(width(rows.length + 1)) - 1;
        bounded(pattern, -1, rows.length - 1);
        const repeat = r.read(2), repeats = repeat === 3 ? bounded(r.read(6), 1, 50) : [5, 10, 20][repeat];
        test = { ...base, source, book, section, pattern, repeats }; break;
      }
      case 'quotes': {
        const length = v1.quoteLengths[r.read(2)];
        if (!length) throw new Error('Invalid quote length.');
        test = { ...base, source, length }; break;
      }
      case 'symbols': test = { ...base, source, variants: Boolean(r.read(1)) }; break;
      default: test = { ...base, source };
    }
    if (version >= 2) {
      if (source !== 'bank' && source !== 'drills') throw new Error('Word options require a word exercise.');
      test.wordPractice = { ...wordPracticeDefaults(), inputMode: r.read(1) ? 'steno' : 'text', requireCorrect: Boolean(r.read(1)), repetitions: bounded(r.read(4) + 1, 1, 10) };
    }
    if (version === 3) {
      test.wordPractice!.repeatOnError = true;
      test.wordPractice!.errorRepetitions = bounded(r.read(4), 1, 10);
    }
    if (version >= 4) {
      const recovery = bounded(r.read(4), 0, 10);
      test.wordPractice!.repeatOnError = recovery > 0;
      test.wordPractice!.errorRepetitions = recovery || 3;
      test.wordPractice!.groupSize = bounded(r.read(4) + 1, 1, 10);
    }
    if (version === 5) {
      const display = (['full', 'current', 'hidden'] as const)[r.read(2)], rate = speechRates[r.read(4)];
      if (!display) throw new Error('Invalid audio display.');
      test.listening = validateListening({ enabled: true, display, rate });
    }
    r.finish();
    encodeSharedTest(test);
    return { ok: true, value: test };
  } catch { return { ok: false, error: 'Invalid test link.' }; }
}

function patches(test: SharedTest) {
  const practice: Partial<Profile['practice']> = { source: test.source };
  let filter: Filter | undefined;
  const concepts = (c: SharedConcepts): Filter => ({ ...defaultFilter(), focus: c.focus, concepts: { mode: 'custom', selected: [...c.concepts] } });
  switch (test.source) {
    case 'bank': filter = { ...concepts(test.filter), pool: test.filter.pool, minLength: test.filter.minLength, maxLength: test.filter.maxLength }; break;
    case 'drills':
      practice.drill = test.drills.length === 1 ? test.drills[0] : 'custom'; practice.mixed = [...test.drills]; practice.restricted = test.filter !== null;
      if (test.filter) filter = concepts(test.filter); break;
    case 'chords': practice.keyboardSet = test.keys; if (test.keys === 'selected') filter = concepts({ concepts: test.concepts, focus: '' }); break;
    case 'fingers': practice.fingerBook = test.book; practice.section = test.section; practice.pattern = test.pattern; practice.repeats = test.repeats; break;
    case 'quotes': practice.quoteLength = test.length; break;
    case 'symbols': practice.symbolVariants = test.variants; break;
  }
  return { practice, filter, session: { listening: test.listening || listeningDefaults(), ...test.session, hints: test.hints, ...wordPracticeDefaults(), ...test.wordPractice } };
}
export function applySharedTest(personal: Profile, test: SharedTest): Profile {
  const patch = patches(test);
  const filter = patch.filter || { ...defaultFilter(), concepts: { mode: 'custom' as const, selected: [...v1.conceptPresets[2]] } };
  // Preserve the explicit snapshot while using a concise preset label when
  // its current definition is identical. Future preset changes fall back to Custom.
  const ids = filter.concepts?.selected || [];
  const matchingMode = (['single', 'starter', 'all'] as const).find(mode => {
    const current = selectedConcepts({ ...filter, concepts: { mode, selected: [] } }, []);
    return current.length === ids.length && current.every(id => ids.includes(id));
  });
  return { ...personal, practice: { ...defaultPractice(), ...patch.practice },
    filter: matchingMode ? { ...filter, concepts: { mode: matchingMode, selected: ids } } : filter,
    session: { ...personal.session, duration: 60, count: 25, ...patch.session }, corrections: [], excluded: [], lists: [], exercises: [], customText: '' };
}
export function saveSharedTest(personal: Profile, test: SharedTest): Profile {
  const patch = patches(test);
  return { ...personal, practice: { ...personal.practice, ...patch.practice }, filter: patch.filter || personal.filter,
    session: { ...personal.session, ...patch.session } };
}
export function sharedHash(route: string, token?: string) {
  const [path, query = ''] = route.split('?');
  const params = new URLSearchParams(query);
  if (token) params.set('t', token);
  if (path === 'practice' && token && params.size === 1) return `#t=${token}`;
  return `#/${path}${params.size ? `?${params}` : ''}`;
}
interface TestLocation { route: string; query?: string; token: string | undefined; shared: SharedTest | null; error: string }
export function parseTestLocation(hash: string): TestLocation {
  const short = hash.startsWith('#t=');
  const query = short ? hash.slice(1) : hash.split('?')[1] || '';
  const params = new URLSearchParams(query), values = params.getAll('t');
  params.delete('t');
  const extra = params.toString();
  const requested = short ? 'practice' : hash.slice(2).split('?')[0];
  const route = ['practice', 'test-settings', 'skills', 'words', 'exercises', 'settings'].includes(requested) ? requested : 'practice';
  if (!values.length) return { route, query: extra, token: undefined, shared: null, error: '' };
  if (values.length !== 1) return { route, token: undefined, shared: null, error: 'Invalid test link.' };
  const result = decodeSharedTest(values[0]);
  return result.ok ? { route, query: extra, token: encodeSharedTest(result.value), shared: result.value, error: '' } : { route, token: values[0], shared: null, error: result.error };
}
