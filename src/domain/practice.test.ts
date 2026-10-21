import { expect, it } from 'vitest';
import { generateWords, scoreInput, speedSample, inputMetrics, burstSpeed } from './practice';

const expected = ['bad', 'dim', 'name'].map(word => ({ word }));
it('scores full-buffer replacements and backspace corrections', () => {
  expect(scoreInput(expected, 'Bad dam ', 60_000)).toMatchObject({ completed: 2, correct: 1, accuracy: 50 });
  expect(scoreInput(expected, 'Bad dim ', 60_000)).toMatchObject({ completed: 2, correct: 2, accuracy: 100 });
  expect(scoreInput(expected, 'Bad d', 60_000).completed).toBe(1);
  expect(scoreInput(expected, 'Bad dim name', 60_000)).toMatchObject({ done: true, wpm: 2.6 });
});
it('records raw speed and unresolved mistakes without claiming physical stroke data', () => {
  expect(speedSample(expected, 'bad dam ', 60_000)).toEqual({ seconds: 60, wpm: .8, raw: 1.6, burst: 0, errors: 0 });
  expect(speedSample(expected, 'bad dim ', 60_000)).toEqual({ seconds: 60, wpm: 1.6, raw: 1.6, burst: 0, errors: 0 });
  expect(speedSample(expected, '', 0)).toEqual({ seconds: 0, wpm: 0, raw: 0, burst: 0, errors: 0 });
});
it('does not start empty or partial input as completed words', () => {
  expect(scoreInput(expected, '', 0)).toMatchObject({ completed: 0, done: false, wpm: 0 });
  expect(scoreInput(expected, 'ba', 1000).completed).toBe(0);
});
it('generates finite shuffled cycles without adjacent repeats', () => {
  const pool = expected.map(w => ({ ...w, outline: 'A' }));
  const result = generateWords(pool, 20, () => 0);
  expect(result).toHaveLength(20);
  expect(result.every((v, i) => i === 0 || v.word !== result[i - 1].word)).toBe(true);
  expect(pool).toEqual(expected.map(w => ({ ...w, outline: 'A' })));
  expect(generateWords([], 50)).toEqual([]);
});

it('records a mistake once when submitted and records later resubmissions separately', () => {
  expect(inputMetrics(expected, '', 'bad dam ').errors).toBe(1);
  expect(inputMetrics(expected, 'bad dam ', 'bad dam n').errors).toBe(0);
  expect(inputMetrics(expected, 'bad dam ', 'bad dim ').errors).toBe(0);
  expect(inputMetrics(expected, 'bad dam', 'bad dam ').errors).toBe(1);
  expect(inputMetrics(expected, 'bad dim ', 'bad dam ').errors).toBe(1);
});
it('calculates burst from inserted characters in a rolling second, including Plover replacements', () => {
  expect(inputMetrics(expected, 'bad', 'bed')).toEqual({ inserted: 1, errors: 0, mistakes: [] });
  expect(inputMetrics(expected, 'bad', 'ba')).toEqual({ inserted: 0, errors: 0, mistakes: [] });
  expect(burstSpeed([{ at: 0, characters: 4 }, { at: 500, characters: 3 }], 1000)).toBe(84);
  expect(burstSpeed([{ at: 500, characters: 3 }], 2000)).toBe(0);
});
it('captures submitted and expected words at the error event, including replacements and multiple mistakes', () => {
  const first = inputMetrics(expected, '', 'Bad dAM nope ');
  expect(first.mistakes).toEqual([{ index: 1, typed: 'dAM', expected: 'dim' }, { index: 2, typed: 'nope', expected: 'name' }]);
  expect(first.errors).toBe(2);
  expect(inputMetrics(expected, 'bad dam ', 'bad dam n').mistakes).toEqual([]);
  expect(inputMetrics(expected, 'bad dam ', 'bad dim ').mistakes).toEqual([]);
  expect(inputMetrics(expected, 'bad dam ', 'bad dem ').mistakes).toEqual([{ index: 1, typed: 'dem', expected: 'dim' }]);
  expect(first.mistakes[0].typed).toBe('dAM');
});
