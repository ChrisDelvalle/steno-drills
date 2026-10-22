import { expect, it } from 'vitest';
import { createOutlineTranslator, textTranslator } from './translation';
import { projectWordPractice, scoreWordPractice, wordPracticeDefaults, wordPracticeMetrics, rebaseRecovery } from './wordPractice';
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


const recoveryOptions = { ...wordPracticeDefaults(), repeatOnError: true, errorRepetitions: 3 };
const recover = (buffer: string, history = new Map<number, number>(), options = recoveryOptions) =>
  projectWordPractice(targets, textTranslator.translate(buffer), options, false, history);
it('starts recovery only on an incorrect submission and otherwise advances normally', () => {
  expect(recover('main ')).toMatchObject({ completed: 1, required: 1, recovering: false });
  expect(recover('mai')).toMatchObject({ completed: 0, recovering: false });
  expect(recover('wrong ')).toMatchObject({ completed: 0, progress: 0, required: 3, recovering: true, dotError: true });
  expect(recover('wrong main main main ')).toMatchObject({ completed: 1, recovering: false, required: 1 });
  expect(recover('wrong main main main net')).toMatchObject({ done: true });
});
it('requires consecutive successes and resets every time a recovery attempt is incorrect', () => {
  expect(recover('wrong main main ')).toMatchObject({ progress: 2, recovering: true });
  expect(recover('wrong main main wrong ')).toMatchObject({ progress: 0, required: 3, dotError: true });
  expect(recover('wrong main main wrong main ')).toMatchObject({ progress: 1, dotError: false });
  expect(recover('wrong main main wrong main main main net')).toMatchObject({ done: true });
});
it('remembered failures prevent correcting the triggering attempt from skipping recovery', () => {
  const history = new Map([[0, 0]]);
  expect(recover('main ', history)).toMatchObject({ completed: 0, progress: 1, required: 3 });
  const laterFailure = new Map([[0, 10]]);
  expect(recover('main main main', laterFailure)).toMatchObject({ completed: 0, progress: 1 });
  expect(recover('main main main main main ', laterFailure)).toMatchObject({ completed: 1 });
});
it('rebases recovery anchors through replacements, deletions, and hint punctuation', () => {
  const previous = 'main main wrong ';
  let history = rebaseRecovery(new Map([[0, 10]]), previous, 'main main');
  expect(history.get(0)).toBe(9);
  expect(recover('main main', history)).toMatchObject({ progress: 0, dotError: true });
  history = rebaseRecovery(history, 'main main', 'main main main');
  expect(recover('main main main', history)).toMatchObject({ progress: 1 });
  expect(rebaseRecovery(new Map([[1, 8]]), 'main ab net', 'main ?ab net').get(1)).toBe(9);
  expect(rebaseRecovery(new Map([[0, 10]]), previous, '').get(0)).toBe(0);
});
it('does not reduce normal repetition requirements and restores them for the next word', () => {
  const options = { ...recoveryOptions, repetitions: 5 };
  expect(recover('wrong main main main ', new Map(), options)).toMatchObject({ progress: 3, required: 5 });
  expect(recover('wrong main main main main main ', new Map(), options)).toMatchObject({ completed: 1, required: 5, recovering: false });
});
it('keeps strict corrections, raw outlines, and unfinished-tail hints compatible with recovery', () => {
  const options = { ...recoveryOptions, requireCorrect: true };
  expect(recover('wrong main ', new Map(), options)).toMatchObject({ progress: 0, completed: 0 });
  expect(recover('main main main', new Map([[0, 0]]), options)).toMatchObject({ completed: 0, progress: 3, hint: 1 });
  const rawOptions = { ...options, inputMode: 'steno' as const };
  expect(projectWordPractice(targets, translator.translate('ZZZZ '), rawOptions)).toMatchObject({ recovering: true, required: 3, progress: 0 });
  expect(projectWordPractice(targets, translator.translate('PHAEUPB PHAEUPB PHAEUPB TPHET'), rawOptions, false, new Map([[0, 0]]))).toMatchObject({ done: true });
});
