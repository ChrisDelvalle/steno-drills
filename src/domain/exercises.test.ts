import { expect, it } from 'vitest';
import { fingerSections, fingerSequence, numberPassage, quotePassage, sentencePassage, symbolPool, textWords, wordDrills } from './exercises';
import { parseStroke } from './classifier';

it('restores word lessons and all 27 finger-drill sections', () => {
  expect(wordDrills.some(d => d.id === 'd-/b-' && d.words.includes('dig'))).toBe(true);
  expect(wordDrills.some(d => d.id === 'Learn Plover: Long Vowel Chords')).toBe(true);
  expect(fingerSections).toHaveLength(27);
  for (const section of fingerSections) for (const pattern of section) for (const stroke of pattern.split('/')) expect(parseStroke(stroke), stroke).not.toBeNull();
});
it('preserves the stroke order and repetitions in finger patterns', () => {
  expect(fingerSequence(['EFB/URP'], 3).map(w => w.word)).toEqual(['EFB','URP','EFB','URP','EFB','URP']);
  expect(fingerSequence(['INVALID'], 10)).toEqual([]);
});
it('generates coherent passages and retains quote attribution', async () => {
  const sentence = await sentencePassage(50, () => 0.5);
  expect(textWords(sentence.text, new Map()).length).toBeGreaterThanOrEqual(50);
  for (const length of ['short','medium','long'] as const) {
    const quote = await quotePassage(length, () => 0.5);
    expect(quote.text.length).toBeGreaterThan(0); expect(quote.source.length).toBeGreaterThan(0);
  }
  expect(numberPassage(20, () => 0.5)).toContain('50');
});
it('uses canonical outlines for every symbol variant', () => {
  expect(symbolPool(false)).toHaveLength(26);
  expect(symbolPool(true)).toHaveLength(104);
  for (const word of symbolPool(true)) expect(parseStroke(word.outline!), word.outline).not.toBeNull();
});
