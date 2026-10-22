import { expect, it } from 'vitest';
import { concepts, singleKeySkills, starterSkills } from './concepts';
import { defaultProfile } from './profile';
import { wordDrills, fingerSections, techniqueSections } from './exercises';
import { shareCatalog as v1 } from './shareCatalog';
import { BitReader, BitWriter, choose, readSet, subsetRank, subsetUnrank, writeSet } from './shareBits';
import { applySharedTest, decodeSharedTest, encodeSharedTest, normalizeSharedTest, parseTestLocation, rangeRank, rangeUnrank, saveSharedTest, sharedHash } from './sharing';
import type { SharedTest } from './sharing';

const snapshot = (p = defaultProfile()) => {
  const result = normalizeSharedTest(p);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const roundTrip = (test: SharedTest) => {
  const token = encodeSharedTest(test), decoded = decodeSharedTest(token);
  expect(decoded).toEqual({ ok: true, value: test });
  if (decoded.ok) expect(encodeSharedTest(decoded.value)).toBe(token);
  return token;
};

it('freezes the v1 IDs, concept presets, and finger pattern tables', () => {
  expect(concepts.map(c => c.id)).toEqual(v1.concepts);
  expect(v1.conceptPresets).toEqual([[], singleKeySkills, starterSkills, concepts.map(c => c.id)]);
  expect(wordDrills.map(d => d.id)).toEqual(v1.drills);
  expect(fingerSections).toEqual(v1.fingerSections);
  expect(techniqueSections['1A']).toEqual(v1.techniquePatterns);
});
it('exhaustively ranks, unranks, and adaptively encodes all subsets of small catalogs', () => {
  for (let n = 2; n <= 10; n++) {
    const seen = new Map<number, Set<string>>();
    const presets = [[], Array.from({ length: n }, (_, i) => i)];
    for (let mask = 0; mask < 2 ** n; mask++) {
      const indices = presets[1].filter(i => mask & (1 << i));
      const rank = subsetRank(indices), k = indices.length;
      expect(subsetUnrank(n, k, rank)).toEqual(indices);
      const ranks = seen.get(k) || new Set<string>(); expect(ranks.has(String(rank))).toBe(false); ranks.add(String(rank)); seen.set(k, ranks);
      const writer = new BitWriter(); writeSet(writer, indices, n, presets);
      const reader = new BitReader(writer.token().padEnd(2, 'A'));
      expect(readSet(reader, n, presets)).toEqual(indices);
    }
    for (const [k, ranks] of seen) expect(BigInt(ranks.size)).toBe(choose(n, k));
  }
});
it('round-trips seeded sparse, dense, preset-delta, and arbitrary real concept selections', () => {
  let seed = 712367;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 400; i++) {
    const p = defaultProfile();
    const density = [0, .01, .05, .2, .5, .8, .99, 1][i % 8];
    p.filter.concepts = { mode: 'custom', selected: v1.concepts.filter(() => random() < density) };
    expect(roundTrip(snapshot(p)).length).toBeLessThanOrEqual(19);
  }
  for (const id of v1.concepts) {
    const p = defaultProfile(); p.learned = starterSkills.includes(id) ? starterSkills.filter(c => c !== id) : [...starterSkills, id];
    expect(roundTrip(snapshot(p)).length).toBe(5);
  }
});
it('covers all 5,050 word-length ranges and focus IDs without losing limits', () => {
  const seen = new Set<number>();
  for (let min = 1; min <= 100; min++) for (let max = min; max <= 100; max++) {
    const rank = rangeRank(min, max); seen.add(rank);
    expect(rangeUnrank(rank)).toEqual({ minLength: min, maxLength: max });
  }
  expect(seen.size).toBe(5050);
  for (const focus of v1.concepts) {
    const p = defaultProfile(); p.filter = { ...p.filter, pool: 'all', focus, minLength: 9, maxLength: 100 };
    roundTrip(snapshot(p));
  }
});
it('round-trips all sources, session lengths, assistance toggles, and built-in option values', () => {
  const base = defaultProfile();
  for (const source of v1.sources) for (const hints of [false, true]) {
    for (const duration of v1.durations) {
      const p = structuredClone(base); p.practice.source = source; p.session = { ...p.session, mode: 'timed', duration, hints }; roundTrip(snapshot(p));
    }
    for (const count of v1.counts) {
      const p = structuredClone(base); p.practice.source = source; p.session = { ...p.session, mode: 'count', count, hints }; roundTrip(snapshot(p));
    }
  }
  for (const keys of v1.keyboards) {
    const p = defaultProfile(); p.practice.source = 'chords'; p.practice.keyboardSet = keys; roundTrip(snapshot(p));
  }
  for (const length of v1.quoteLengths) {
    const p = defaultProfile(); p.practice.source = 'quotes'; p.practice.quoteLength = length; roundTrip(snapshot(p));
  }
  for (const symbolVariants of [false, true]) {
    const p = defaultProfile(); p.practice.source = 'symbols'; p.practice.symbolVariants = symbolVariants; roundTrip(snapshot(p));
  }
});
it('covers every built-in finger section and pattern, including all and bounded repeat values', () => {
  for (const book of ['duo', 'technique'] as const) {
    const sections = book === 'duo' ? fingerSections : [techniqueSections['1A']];
    sections.forEach((patterns, section) => {
      for (let pattern = -1; pattern < patterns.length; pattern++) {
        const p = defaultProfile(); p.practice = { ...p.practice, source: 'fingers', fingerBook: book, section, pattern };
        roundTrip(snapshot(p));
      }
    });
  }
  for (let repeats = 1; repeats <= 50; repeats++) {
    const p = defaultProfile(); p.practice = { ...p.practice, source: 'fingers', repeats }; roundTrip(snapshot(p));
  }
});
it('round-trips all individual drills, restricted/unrestricted and mixed selections', () => {
  for (const drill of v1.drills) for (const restricted of [true, false]) {
    const p = defaultProfile(); p.practice = { ...p.practice, source: 'drills', drill, restricted }; roundTrip(snapshot(p));
  }
  for (let i = 0; i < 64; i++) {
    const p = defaultProfile(); p.practice = { ...p.practice, source: 'drills', drill: 'custom', mixed: v1.drills.filter((_, n) => (n * 13 + i) % 17 < i % 17) };
    p.filter.concepts = { mode: 'custom', selected: v1.concepts.filter((_, n) => (n * 7 + i) % 13 < 6) }; p.filter.focus = 'initial.d';
    expect(roundTrip(snapshot(p)).length).toBeLessThanOrEqual(31);
  }
});
it('enforces the promised compact token bounds', () => {
  const p = defaultProfile(); expect(roundTrip(snapshot(p))).toHaveLength(4);
  p.learned.push('initial.v'); expect(roundTrip(snapshot(p))).toHaveLength(5);
  p.filter.concepts = { mode: 'custom', selected: v1.concepts.filter((_, i) => i % 2 === 0) };
  expect(roundTrip(snapshot(p))).toHaveLength(19);
  p.filter.focus = 'initial.d'; p.filter.minLength = 2; p.filter.maxLength = 100;
  expect(roundTrip(snapshot(p)).length).toBeLessThanOrEqual(22);
  p.practice = { ...p.practice, source: 'drills', drill: 'custom', mixed: v1.drills.filter((_, i) => i % 2 === 0) };
  expect(roundTrip(snapshot(p)).length).toBeLessThanOrEqual(31);
});
it('keeps committed v1 golden tokens stable', () => {
  const tokens = { bank: 'ICCA', drills: 'IiASA', chords: 'JCBA', fingers: 'JiAG', quotes: 'LCQ', symbols: 'MiA', sentences: 'KC', 'two-key': 'Ki', numbers: 'Li', 'number-sentences': 'MC' };
  for (const [source, token] of Object.entries(tokens)) {
    const p = defaultProfile(); p.practice.source = source;
    expect(encodeSharedTest(snapshot(p))).toBe(token);
    expect(decodeSharedTest(token)).toEqual({ ok: true, value: snapshot(p) });
  }
  const p = defaultProfile(); p.learned.push('initial.v'); expect(encodeSharedTest(snapshot(p))).toBe('ICGjw');
  p.filter.concepts = { mode: 'custom', selected: v1.concepts.filter((_, i) => i % 2 === 0) }; p.filter.focus = 'initial.d'; p.filter.minLength = 2; p.filter.maxLength = 100;
  expect(encodeSharedTest(snapshot(p))).toBe('ICaqqqqqqqqqqqqqqqhwYw');
  p.practice = { ...p.practice, source: 'drills', drill: 'custom', mixed: v1.drills.filter((_, i) => i % 2 === 0) };
  expect(encodeSharedTest(snapshot(p))).toBe('Ii1VVVVVVVVVVaqqqqqqqqqqqqqqqhw');
});
it('omits inactive parameters and resolves saved filters independently of recipient data', () => {
  const p = defaultProfile(); const token = encodeSharedTest(snapshot(p));
  p.session.count = 500; p.practice.quoteLength = 'long'; p.practice.symbolVariants = true;
  expect(encodeSharedTest(snapshot(p))).toBe(token);
  p.practice.source = 'filter:everything'; expect(encodeSharedTest(snapshot(p))).toBe(token);
  for (const mode of ['personal', 'single', 'starter', 'all', 'custom'] as const) {
    p.practice.source = 'bank'; p.filter.concepts = { mode, selected: ['initial.d'] }; roundTrip(snapshot(p));
  }
});
it('isolates shared tests while saving only supported test parameters', () => {
  const teacher = defaultProfile(); teacher.session.duration = 90; teacher.session.hints = true;
  const personal = defaultProfile(); personal.learned = []; personal.theme = 'light'; personal.session.lines = 6; personal.session.hintPosition = 'below';
  personal.excluded = ['bad']; personal.corrections = [{ word: 'bad', outlines: ['PWAD'], syllables: 1, pronunciation: 'B AE1 D' }];
  personal.lists = [{ id: 'mine', name: 'Mine', words: ['bad'] }];
  const before = structuredClone(personal), test = snapshot(teacher), effective = applySharedTest(personal, test);
  expect(personal).toEqual(before); expect(effective.learned).toEqual([]); expect(effective.theme).toBe('light');
  expect(effective.session).toMatchObject({ duration: 90, hints: true, lines: 6, hintPosition: 'below' });
  expect(effective.excluded).toEqual([]); expect(effective.corrections).toEqual([]);
  expect(effective.filter.concepts?.selected).toEqual(starterSkills);
  const saved = saveSharedTest(personal, test);
  expect(saved.learned).toEqual([]); expect(saved.lists).toEqual(personal.lists); expect(saved.excluded).toEqual(personal.excluded); expect(saved.corrections).toEqual(personal.corrections);
  expect(saved.session).toEqual(effective.session);
});
it('rejects custom content while ignoring unshared dictionary and aesthetic data', () => {
  const p = defaultProfile(), token = encodeSharedTest(snapshot(p));
  p.customText = 'Anything'; p.theme = 'light'; p.session.lines = 8; p.session.hintPosition = 'below'; p.excluded = ['bad'];
  p.corrections = [{ word: 'bad', outlines: ['PWAD'], syllables: 1, pronunciation: '' }];
  expect(encodeSharedTest(snapshot(p))).toBe(token);
  for (const source of ['text', 'list:mine']) { p.practice.source = source; expect(normalizeSharedTest(p).ok).toBe(false); }
  p.practice.source = 'fingers'; p.practice.fingerBook = 'custom'; expect(normalizeSharedTest(p).ok).toBe(false);
});
it('rejects malformed, truncated, out-of-range, and unsupported links without throwing', () => {
  const token = encodeSharedTest(snapshot());
  for (const invalid of ['', 'A', '*bad*', 'A'.repeat(129), token + 'A', token.slice(0, -1), token.slice(0, -1) + 'B']) expect(decodeSharedTest(invalid).ok).toBe(false);
  const unsupported = new BitWriter(); unsupported.write(7, 3); unsupported.write(0, 9);
  expect(decodeSharedTest(unsupported.token())).toEqual({ ok: false, error: 'Unsupported test link version.' });
  const badSource = new BitWriter(); badSource.write(1, 3); badSource.write(15, 4); badSource.write(0, 5);
  expect(decodeSharedTest(badSource.token()).ok).toBe(false);
  expect(() => subsetUnrank(92, 2, choose(92, 2))).toThrow();
  expect(() => rangeUnrank(5050)).toThrow();
  let seed = 17;
  for (let i = 0; i < 500; i++) {
    const token = Array.from({ length: i % 40 }, () => { seed = (seed * 16807) % 2147483647; return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[seed % 64]; }).join('');
    expect(() => decodeSharedTest(token)).not.toThrow();
  }
});
it('preserves ordinary routes and auxiliary query parameters, with canonical shared navigation', () => {
  const token = encodeSharedTest(snapshot());
  expect(sharedHash('practice', token)).toBe('#t=' + token);
  expect(parseTestLocation('#t=' + token).shared).toEqual(snapshot());
  expect(parseTestLocation(sharedHash('skills', token))).toMatchObject({ route: 'skills', token });
  expect(parseTestLocation(sharedHash('exercises?word=bad', token))).toMatchObject({ route: 'exercises', token, query: 'word=bad' });
  expect(parseTestLocation('#/exercises?word=bad')).toMatchObject({ route: 'exercises', query: 'word=bad', shared: null });
  expect(parseTestLocation('#/practice?t=' + token + '&t=' + token).error).toBeTruthy();
});

it('round-trips all word options with v2 and preserves v1 when options are inactive', () => {
  for (const source of ['bank', 'drills']) for (const inputMode of ['text', 'steno'] as const) for (const requireCorrect of [false, true]) for (let repetitions = 1; repetitions <= 10; repetitions++) {
    const p = defaultProfile(); p.practice.source = source;
    p.session = { ...p.session, inputMode, repetitions, requireCorrect };
    const test = snapshot(p), token = roundTrip(test);
    const plain = defaultProfile(); plain.practice.source = source;
    expect(token.length).toBe(encodeSharedTest(snapshot(plain)).length + Number(test.version === 2));
    const effective = applySharedTest(defaultProfile(), test);
    expect(effective.session).toMatchObject({ inputMode, repetitions, requireCorrect });
    expect(saveSharedTest(defaultProfile(), test).session).toEqual(effective.session);
  }
  const p = defaultProfile(); p.session = { ...p.session, inputMode: 'steno', repetitions: 10, requireCorrect: true };
  p.practice.source = 'numbers';
  expect(snapshot(p).version).toBe(1);
  expect(applySharedTest(p, snapshot()).session).toMatchObject({ inputMode: 'text', repetitions: 1, requireCorrect: false });
});
it('freezes v2 fixtures and rejects malformed extensions and incompatible exercises', () => {
  const p = defaultProfile(); p.session.inputMode = 'steno'; p.session.repetitions = 3; p.session.requireCorrect = true;
  expect(encodeSharedTest(snapshot(p))).toBe('QCCZA');
  const valid = encodeSharedTest(snapshot(p));
  expect(decodeSharedTest(valid.slice(0, -1)).ok).toBe(false);
  // Replace the 4-bit repeat count with reserved value 15.
  const old = new BitWriter(); old.write(2, 3); old.write(0, 4); old.write(1, 4); old.write(0, 1);
  old.write(0, 1); old.write(0, 1); old.write(0, 2); old.write(2, 2); old.write(0, 1);
  old.write(1, 1); old.write(1, 1); old.write(15, 4);
  expect(decodeSharedTest(old.token()).ok).toBe(false);
  const incompatible = new BitWriter(); incompatible.write(2, 3); incompatible.write(8, 4); incompatible.write(0, 5); incompatible.write(1, 6);
  expect(decodeSharedTest(incompatible.token()).ok).toBe(false);
});
it('rejects invalid options when creating a word snapshot rather than dropping them', () => {
  for (const repetitions of [0, 11, 1.5, NaN]) {
    const p = defaultProfile(); p.session.repetitions = repetitions;
    expect(normalizeSharedTest(p).ok).toBe(false);
  }
});
it('round-trips every recovery count with v3 and keeps old links independent of recipient defaults', () => {
  for (const source of ['bank', 'drills']) for (const inputMode of ['text', 'steno'] as const) for (const requireCorrect of [false, true]) for (let errorRepetitions = 1; errorRepetitions <= 10; errorRepetitions++) {
    const p = defaultProfile(); p.practice.source = source;
    p.session = { ...p.session, repeatOnError: true, errorRepetitions, inputMode, requireCorrect, repetitions: 2 };
    const test = snapshot(p), token = roundTrip(test);
    expect(test.version).toBe(3);
    expect(applySharedTest(defaultProfile(), test).session).toMatchObject({ repeatOnError: true, errorRepetitions });
    expect(saveSharedTest(defaultProfile(), test).session).toMatchObject({ repeatOnError: true, errorRepetitions });
    expect(token.length).toBeLessThanOrEqual(encodeSharedTest(snapshot()).length + 2 + Number(source === 'drills'));
  }
  const personal = defaultProfile(); personal.session.repeatOnError = true; personal.session.errorRepetitions = 8;
  const old = decodeSharedTest('QCCZA'); if (!old.ok) throw new Error(old.error);
  expect(applySharedTest(personal, old.value).session).toMatchObject({ repeatOnError: false, errorRepetitions: 3 });
  personal.session.repeatOnError = false;
  expect(encodeSharedTest(snapshot(personal))).toBe('ICCA');
});
it('freezes v3 fixtures and rejects invalid recovery payloads', () => {
  const p = defaultProfile(); p.session.repeatOnError = true;
  expect(encodeSharedTest(snapshot(p))).toBe('YCCAG');
  p.session.inputMode = 'steno'; p.session.requireCorrect = true; p.session.repetitions = 3;
  expect(encodeSharedTest(snapshot(p))).toBe('YCCZG');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bits = [...'YCCAG'].map(c => alphabet.indexOf(c).toString(2).padStart(6, '0')).join('');
  for (const count of [0, 11, 12, 13, 14, 15]) {
    const w = new BitWriter(); w.bits = bits.slice(0, 25); w.write(count, 4);
    expect(decodeSharedTest(w.token()).ok).toBe(false);
  }
  for (const invalid of ['YCCA', 'YCCAGA', 'YCCAH']) expect(decodeSharedTest(invalid).ok).toBe(false);
  const wrongSource = new BitWriter(); wrongSource.bits = '0110010' + bits.slice(7, 29);
  expect(decodeSharedTest(wrongSource.token()).ok).toBe(false);
  p.session.repeatOnError = false; p.session.errorRepetitions = 10;
  expect(encodeSharedTest(snapshot(p))).toBe('QCCZA');
});
