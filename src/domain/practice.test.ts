import { expect, it } from 'vitest';
import { generateWords, scoreInput } from './practice';

const expected = ['bad', 'dim', 'name'].map(word => ({ word }));
it('scores full-buffer replacements and backspace corrections', () => {
  expect(scoreInput(expected, 'Bad dam ', 60_000)).toMatchObject({ completed: 2, correct: 1, accuracy: 50 });
  expect(scoreInput(expected, 'Bad dim ', 60_000)).toMatchObject({ completed: 2, correct: 2, accuracy: 100 });
  expect(scoreInput(expected, 'Bad d', 60_000).completed).toBe(1);
  expect(scoreInput(expected, 'Bad dim name', 60_000)).toMatchObject({ done: true, wpm: 2.6 });
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
