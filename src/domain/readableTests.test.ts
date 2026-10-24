import { expect, it } from 'vitest';
import { defaultProfile } from './profile';
import { shareCatalog as catalog } from './shareCatalog';
import { parseTestLocation, encodeSharedTest, normalizeSharedTest } from './sharing';
import { parseReadableProfile, readableConceptPresets, readableParameters } from './readableTests';
import type { Profile } from './types';

const query = (values: Record<string, string | number | boolean>) => new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)]));
function matches(values: Record<string, string | number | boolean>, change: (p: Profile) => void = () => {}) {
  const expected = defaultProfile(); change(expected);
  const result = normalizeSharedTest(expected); if (!result.ok) throw new Error(result.error);
  const location = parseTestLocation('#/practice?' + query(values));
  expect(location.error).toBe(''); expect(location.query).toBeUndefined();
  expect(location.token).toBe(encodeSharedTest(result.value)); expect(location.shared).toBeTruthy();
}
it('uses an explicit starter snapshot and freezes the initial-L example', () => {
  expect(parseTestLocation('#/practice?exercise=bank').token).toBe('ICCA');
  expect(parseTestLocation('#/practice?concepts=all&focus=initial.l&seconds=60').token).toBe('ICDiQ');
  expect(parseTestLocation('#/practice').shared).toBeNull();
  expect(parseTestLocation('#/skills?concepts=all')).toMatchObject({ shared: null, query: 'concepts=all' });
});
it('matches Share across every built-in exercise, duration, count, and hints value', () => {
  for (const source of catalog.sources) for (const hints of [false, true]) {
    for (const seconds of catalog.durations) matches({ exercise: source, seconds, hints }, p => { p.practice.source = source; p.session.duration = seconds; p.session.hints = hints; });
    for (const count of ['fingers', 'quotes', 'two-key'].includes(source) ? [25] : catalog.counts) matches({ exercise: source, count, hints }, p => { p.practice.source = source; p.session.mode = 'count'; p.session.count = count; p.session.hints = hints; });
  }
});
it('matches every concept preset, focus, arbitrary subset, pool and length boundary', () => {
  for (const [name, ids] of Object.entries(readableConceptPresets)) matches({ concepts: name }, p => { p.filter.concepts = { mode: 'custom', selected: [...ids] }; });
  for (const focus of catalog.concepts) matches({ concepts: 'all', focus }, p => { p.filter.concepts = { mode: 'all', selected: [] }; p.filter.focus = focus; });
  for (const ids of [catalog.concepts.slice(0, 7), catalog.concepts.filter((_, i) => i % 2), catalog.concepts.slice(-11)]) matches({ concepts: ids.join(',') }, p => { p.filter.concepts = { mode: 'custom', selected: [...ids] }; });
  for (const pool of ['common', 'all'] as const) for (const [minLength, maxLength] of [[1, 1], [1, 100], [100, 100], [3, 8]]) matches({ pool, minLength, maxLength }, p => { p.filter = { ...p.filter, pool, minLength, maxLength }; });
});
it('matches individual drills, encoded IDs, mixes, unrestricted drills and empty mixes', () => {
  for (const drill of catalog.drills) matches({ exercise: 'drills', drills: drill }, p => { p.practice.source = 'drills'; p.practice.drill = drill; });
  for (const mixed of [[], catalog.drills.slice(2, 9), [...catalog.drills]]) for (const restricted of [false, true]) matches({ exercise: 'drills', drills: mixed.join(','), restricted }, p => { p.practice = { ...p.practice, source: 'drills', drill: 'custom', mixed: [...mixed], restricted }; });
  matches({ exercise: 'drills', concepts: 'all', focus: 'initial.l' }, p => { p.practice.source = 'drills'; p.filter.concepts = { mode: 'all', selected: [] }; p.filter.focus = 'initial.l'; });
});
it('matches built-in keyboard sets, every finger pattern, repeat count, quote and symbol option', () => {
  for (const keyboardSet of catalog.keyboards) matches({ exercise: 'chords', keyboardSet }, p => { p.practice.source = 'chords'; p.practice.keyboardSet = keyboardSet; });
  matches({ exercise: 'chords', concepts: 'all' }, p => { p.practice.source = 'chords'; p.filter.concepts = { mode: 'all', selected: [] }; });
  for (const fingerBook of ['duo', 'technique'] as const) {
    const sections = fingerBook === 'duo' ? catalog.fingerSections : [catalog.techniquePatterns];
    for (const [section, patterns] of sections.entries()) for (let pattern = -1; pattern < patterns.length; pattern++) matches({ exercise: 'fingers', fingerBook, ...(fingerBook === 'duo' ? { section } : {}), pattern }, p => { p.practice = { ...p.practice, source: 'fingers', fingerBook, section, pattern }; });
  }
  for (let repeats = 1; repeats <= 50; repeats++) matches({ exercise: 'fingers', repeats }, p => { p.practice.source = 'fingers'; p.practice.repeats = repeats; });
  for (const quoteLength of catalog.quoteLengths) matches({ exercise: 'quotes', quoteLength }, p => { p.practice.source = 'quotes'; p.practice.quoteLength = quoteLength; });
  for (const symbolVariants of [false, true]) matches({ exercise: 'symbols', symbolVariants }, p => { p.practice.source = 'symbols'; p.practice.symbolVariants = symbolVariants; });
});
it('matches v2–v5 word options at every repetition, recovery, group and audio choice', () => {
  for (const source of ['bank', 'drills']) for (const inputMode of ['text', 'steno'] as const) for (const requireCorrect of [false, true]) {
    for (let n = 1; n <= 10; n++) matches({ exercise: source, inputMode, requireCorrect, repetitions: n, groupSize: n, repeatOnError: true, errorRepetitions: n }, p => {
      p.practice.source = source; p.session = { ...p.session, inputMode, requireCorrect, repetitions: n, groupSize: n, repeatOnError: true, errorRepetitions: n };
    });
    for (const display of ['full', 'current', 'hidden'] as const) for (const rate of readableParameters.rate.values) matches({ exercise: source, audio: true, display, rate, inputMode, requireCorrect }, p => {
      p.practice.source = source; p.session.inputMode = inputMode; p.session.requireCorrect = requireCorrect; p.session.listening = { enabled: true, display, rate };
    });
  }
});
it.each([
  ['seconds=999', 'seconds'], ['count=999', 'count'], ['seconds=60&count=50', 'seconds or count'],
  ['seconds=60&seconds=60', 'Duplicate'], ['unknown=x', 'Unknown'], ['exercise=text', 'exercise'], ['exercise=list:local', 'exercise'],
  ['concepts=personal', 'concepts'], ['concepts=initial.missing', 'concepts'], ['focus=initial.missing', 'focus'],
  ['concepts=', 'concepts'], ['hints=1', 'true or false'], ['hints=TRUE', 'true or false'], ['seconds=', 'number'],
  ['seconds=NaN', 'number'], ['seconds=Infinity', 'number'], ['seconds=0x3c', 'number'], ['seconds=1e2', 'number'],
  ['seconds=30.5', 'whole'], ['minLength=0', 'between'], ['minLength=10&maxLength=3', 'minLength'],
  ['repetitions=11', 'between'], ['groupSize=0', 'between'], ['inputMode=raw', 'inputMode'],
  ['display=hidden', 'audio=true'], ['rate=1.1', 'audio=true'], ['audio=true&rate=2.1', 'rate'],
  ['errorRepetitions=3', 'repeatOnError=true'], ['exercise=drills&drills=unknown', 'drills'],
  ['exercise=drills&restricted=false&concepts=all', 'restricted=true'], ['exercise=drills&restricted=false&focus=initial.l', 'restricted=true'],
  ['exercise=chords&keyboardSet=Vowels&concepts=all', 'keyboardSet=selected'],
  ['exercise=fingers&fingerBook=custom', 'fingerBook'], ['exercise=fingers&fingerBook=technique&section=0', 'section'],
  ['exercise=fingers&pattern=8', 'pattern'], ['exercise=fingers&count=50', 'count=25'], ['exercise=quotes&count=10', 'count=25'],
])('rejects invalid or incompatible %s without substituting a test', (raw, message) => {
  expect(parseTestLocation('#/practice?' + raw)).toMatchObject({ shared: null, token: undefined, error: expect.stringContaining(message) });
});
it('rejects every source-incompatible parameter and mixed tokens', () => {
  for (const [key, spec] of Object.entries(readableParameters)) if ('sources' in spec) {
    const source = catalog.sources.find(s => !(spec.sources as readonly string[]).includes(s))!;
    const value = Array.isArray(spec.default) ? spec.default.join(',') : spec.default;
    expect(parseReadableProfile(query({ exercise: source, [key]: value })).ok).toBe(false);
  }
  for (const hash of ['#/practice?t=ICCA&seconds=60', '#t=ICCA&seconds=60']) expect(parseTestLocation(hash).error).toContain('not both');
  expect(parseTestLocation('#/practice?concepts=' + 'x'.repeat(16 * 1024)).error).toContain('16 KiB');
  expect(parseTestLocation('#/practice?' + 'é'.repeat(8192)).error).toContain('16 KiB');
});
