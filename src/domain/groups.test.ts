import { expect, it } from 'vitest';
import { projectWordPractice, rebaseRecovery, wordPracticeDefaults, wordPracticeMetrics } from './wordPractice';
import { createOutlineTranslator, textTranslator } from './translation';
import { makeEntry } from './classifier';
const targets = ['a', 'b', 'c', 'd', 'e'].map(word => ({ word }));
const options = { ...wordPracticeDefaults(), groupSize: 2, repetitions: 2 };
const project = (buffer: string, patch = {}, history = new Map<number, number>()) => projectWordPractice(targets, textTranslator.translate(buffer), { ...options, ...patch }, false, history);

it('repeats contiguous groups at every supported size/count, including a shorter final group', () => {
  const words = Array.from({ length: 23 }, (_, i) => ({ word: `word${i}` }));
  for (let groupSize = 1; groupSize <= 10; groupSize++) for (let repetitions = 1; repetitions <= 10; repetitions++) {
    const sequence: string[] = [];
    for (let start = 0; start < words.length; start += groupSize) for (let pass = 0; pass < repetitions; pass++) sequence.push(...words.slice(start, start + groupSize).map(w => w.word));
    const p = projectWordPractice(words, textTranslator.translate(sequence.join(' ')), { ...options, groupSize, repetitions });
    expect(p).toMatchObject({ done: true, completed: 23, correct: 23 * repetitions });
  }
});
it('previews a whole pass and its next hint, while edits and backspaces reverse progress', () => {
  expect(project('a')).toMatchObject({ current: 0, hint: 1, progress: 0 });
  expect(project('a b')).toMatchObject({ current: 1, hint: 0, progress: 1, completed: 0 });
  expect(project('a b a b')).toMatchObject({ current: 1, hint: 2, progress: 2, completed: 0 });
  expect(project('a b a bx')).toMatchObject({ current: 1, hint: 1, progress: 1 });
  expect(project('a b a ')).toMatchObject({ current: 1, progress: 1 });
  expect(project('a b ').cells.slice(0, 2)).toMatchObject([{ typed: '', complete: false }, { typed: '', complete: false }]);
  expect(project('a b a b c')).toMatchObject({ current: 2, groupStart: 2, groupEnd: 4, progress: 0 });
});
it('fails the whole pass while retaining ordinary completed passes', () => {
  expect(project('a b a wrong ')).toMatchObject({ progress: 1, current: 0, groupWrong: true });
  expect(project('a b a wrong a b ')).toMatchObject({ current: 2, completed: 2, progress: 0, required: 2 });
  expect(project('a wrong c d e', { repetitions: 1 })).toMatchObject({ done: true, correct: 4 });
  expect(project('a wrong ', { repetitions: 1 })).toMatchObject({ groupStart: 2, groupWrong: false });
});
it('keeps Require correct at the incorrect word and accepts corrections to that pass', () => {
  const p = project('a wrong a b ', { requireCorrect: true });
  expect(p).toMatchObject({ current: 1, progress: 0, completed: 0 });
  expect(p.cells[1].annotation).toBe('wrong a b');
  expect(project('a b a b ', { requireCorrect: true })).toMatchObject({ current: 2, completed: 2 });
});
it('requires consecutive whole passes in recovery and remembers the reset after correction', () => {
  const patch = { repetitions: 1, repeatOnError: true, errorRepetitions: 3 };
  expect(project('a wrong a b ', patch)).toMatchObject({ progress: 1, required: 3, current: 0 });
  expect(project('a wrong a b a wrong ', patch)).toMatchObject({ progress: 0, recovering: true });
  expect(project('a wrong a b a b', patch, new Map([[0, 12]]))).toMatchObject({ progress: 1, required: 3, hint: 0 });
  expect(project('a b', patch, new Map([[0, 0]]))).toMatchObject({ progress: 1, completed: 0 });
  expect(project('a wrong a b a b a b ', patch)).toMatchObject({ completed: 2, required: 1, recovering: false, groupWrong: false });
});
it('anchors errors to their group and pass, while preserving word-level error events', () => {
  const before = project('a b a b c '), after = project('a b a b c wrong ');
  expect(wordPracticeMetrics(before, after)).toMatchObject({ failures: [{ target: 2, start: 8 }], mistakes: [{ index: 3, typed: 'wrong', expected: 'd' }] });
  expect(wordPracticeMetrics(after, after).mistakes).toEqual([]);
  const rebased = rebaseRecovery(new Map([[0, 12]]), 'a wrong a b a wrong ', 'a wrong a b');
  expect(project('a wrong a b', { repetitions: 1, repeatOnError: true }, rebased).progress).toBe(0);
});
it('supports raw alternatives, strict recovery, and a final correct tail without whitespace', () => {
  const entries = [makeEntry('a', ['A', 'AEU'], []), makeEntry('b', ['PW', 'P/W'], [])];
  const translator = createOutlineTranslator(entries), words = entries.map(e => ({ word: e.word }));
  const opts = { ...options, inputMode: 'steno' as const, requireCorrect: true, repeatOnError: true, errorRepetitions: 2 };
  expect(projectWordPractice(words, translator.translate('a pw aeu p/w'), opts)).toMatchObject({ done: true, correct: 4 });
  const failed = projectWordPractice(words, translator.translate('A ZZZZ A PW'), opts);
  expect(failed).toMatchObject({ current: 1, recovering: true, progress: 0 });
  expect(projectWordPractice(words, translator.translate('a pw aeu p/w'), opts, false, new Map([[0, 0]]))).toMatchObject({ done: true });
});

it('scores completed words at a deadline without completing a partial group pass', () => {
  const p = projectWordPractice(targets, textTranslator.translate('a b c'), { ...options, groupSize: 3 }, true);
  expect(p).toMatchObject({ correct: 3, correctChars: 6, completed: 0, progress: 1, done: false });
  expect(projectWordPractice([], textTranslator.translate(''), options)).toMatchObject({ done: false, completed: 0 });
});
