import { expect, it } from 'vitest';
import { createOutlineTranslator, textTranslator } from './translation';
import { projectWordPractice, scoreWordPractice, wordPracticeDefaults, wordPracticeMetrics } from './wordPractice';
import { makeEntry } from './classifier';

const entries = [makeEntry('main', ['PHAEUPB', 'PH/AEUPB'], []), makeEntry('net', ['TPHET'], []), makeEntry('ma', ['PHA'], [])];
const translator = createOutlineTranslator(entries);
const targets = entries.slice(0, 2).map(w => ({ word: w.word, outline: w.outlines[0].outline }));
const options = { ...wordPracticeDefaults(), inputMode: 'steno' as const };
const raw = (buffer: string, repetitions = 1, requireCorrect = false) => projectWordPractice(targets, translator.translate(buffer), { ...options, repetitions, requireCorrect });
const text = (buffer: string, repetitions = 3, requireCorrect = false) => projectWordPractice(targets, textTranslator.translate(buffer), { ...options, inputMode: 'text', repetitions, requireCorrect });
it('translates alternatives, lowercase and multiple strokes, keeping native ranges and pending states', () => {
  expect(translator.translate('phaeupb PH/AEUPB TPH').units).toMatchObject([
    { text: 'main', start: 0, end: 7, submitted: true },
    { text: 'main', start: 8, end: 16, submitted: true }, { status: 'pending', submitted: false },
  ]);
  expect(raw('phaeupb tphET')).toMatchObject({ done: true, correct: 2 });
  expect(raw('PH/AEUPB TPHET')).toMatchObject({ done: true });
  expect(raw('PH')).toMatchObject({ progress: 0, completed: 0 });
  expect(raw('PH').cells[0]).toMatchObject({ annotation: 'PH', neutral: true, wrong: false });
});
it('never guesses ambiguous or unknown translations, or executes command syntax', () => {
  const conflicting = createOutlineTranslator([...entries, makeEntry('other', ['PHAEUPB'], [])]);
  expect(conflicting.translate('PHAEUPB ').units[0].status).toBe('conflict');
  expect(translator.translate('ZZZZ {PLOVER:QUIT} ').units.every(u => u.status === 'unknown')).toBe(true);
  expect(raw('ZZZZ ').cells[0]).toMatchObject({ wrong: true, annotation: 'ZZZZ' });
});
it('keeps source offsets intact when hint punctuation is omitted', () => {
  expect(translator.translate('?PHA?EUPB? TPHET', true).units).toMatchObject([
    { text: 'main', start: 1, end: 9 }, { text: 'net', start: 11, end: 16 },
  ]);
});
it('supports every repetition count and counts target words rather than flattened repeated targets', () => {
  for (let n = 1; n <= 10; n++) {
    const p = raw(Array(n).fill('PHAEUPB').join(' ') + ' ' + Array(n).fill('TPHET').join(' '), n);
    expect(p).toMatchObject({ done: true, correct: 2 * n, completed: 2 });
  }
});
it('retains correct repetitions through mistakes and lets non-strict attempts retry', () => {
  expect(text('main wrong main ')).toMatchObject({ current: 0, completed: 0, progress: 2, correct: 2 });
  expect(text('main wrong main main net net net')).toMatchObject({ done: true, correct: 6 });
});
it('blocks progression at the incorrect attempt until it is corrected', () => {
  const blocked = text('main wrong main main net net net ', 3, true);
  expect(blocked).toMatchObject({ current: 0, completed: 0, progress: 1, correct: 1 });
  expect(blocked.cells[0].annotation).toBe('wrong main main net net net');
  expect(text('main main main net net net ', 3, true)).toMatchObject({ done: true, correct: 6 });
  expect(text('wrong net ', 1, true).completed).toBe(0);
});
it('previews the last repetition and next hint without a space and reverses edits', () => {
  expect(raw('PHAEUPB PHAEUPB PHAEUPB', 3)).toMatchObject({ current: 0, completed: 0, progress: 3, hint: 1 });
  expect(raw('PHAEUPB PHAEUPB PHAEU', 3)).toMatchObject({ current: 0, progress: 2, hint: 0 });
  expect(raw('PHAEUPB PHAEUPB ', 3)).toMatchObject({ progress: 2, correct: 2 });
  expect(raw('PHAEUPB ', 3)).toMatchObject({ progress: 1, correct: 1 });
});
it('records a submitted mistake once and retains it in assisted scoring after correction', () => {
  const before = text('main ', 1, true), bad = text('main wrong ', 1, true);
  const metrics = wordPracticeMetrics(before, bad);
  expect(metrics.mistakes).toHaveLength(1);
  expect(wordPracticeMetrics(bad, bad).mistakes).toHaveLength(0);
  expect(wordPracticeMetrics(bad, text('main wrong net ', 1, true)).mistakes).toHaveLength(0);
  expect(wordPracticeMetrics(bad, text('main net', 1, true)).mistakes).toHaveLength(0);
  expect(scoreWordPractice(text('main net', 1, true), targets, 60000, metrics.mistakes, metrics.incorrectChars)).toMatchObject({ correct: 2, correctChars: 9, rawChars: 15 });
  expect(scoreWordPractice(text('main net', 1, true), targets, 60000, metrics.mistakes, metrics.incorrectChars).accuracy).toBeCloseTo(200 / 3);
});
it('scores translated character lengths rather than raw outline lengths', () => {
  const p = raw('PHAEUPB TPHET');
  expect(scoreWordPractice(p, targets, 60000, [], 0)).toMatchObject({ wpm: 1.8, correctChars: 9 });
});
it('reports unambiguous word availability without resolving conflicts toward a target', () => {
  expect(translator.hasWord('main')).toBe(true);
  const conflicting = createOutlineTranslator([makeEntry('first', ['A'], []), makeEntry('second', ['A'], [])]);
  expect(conflicting.hasWord('first')).toBe(false);
  expect(conflicting.hasWord('second')).toBe(false);
});
it('credits a complete tail when the timer or Finish establishes the final boundary', () => {
  const input = translator.translate('PHAEUPB');
  expect(projectWordPractice(targets, input, { ...options, repetitions: 3 }).correct).toBe(0);
  expect(projectWordPractice(targets, input, { ...options, repetitions: 3 }, true).correct).toBe(1);
  expect(projectWordPractice(targets, translator.translate('PHAEU'), options, true).correct).toBe(0);
});
