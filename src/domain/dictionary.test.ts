import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { starterSkills } from './concepts';
import { evaluate } from './vocabulary';
import type { Dictionary } from './types';

const dictionary: Dictionary = JSON.parse(readFileSync(resolve('public/dictionary.json'), 'utf8'));
it('meets acceptance examples using the real pinned dictionaries', () => {
  for (const word of ['bad','dim','name','feet','like','judge']) {
    const entry = dictionary.words.find(w => w.word === word)!;
    expect(entry, word).toBeDefined();
    const result = evaluate(entry, starterSkills);
    expect(result.eligible, word).toBe(true);
    expect(entry.outlines.some(a => a.outline === result.outline && a.requirements.length)).toBe(true);
  }
  expect(evaluate(dictionary.words.find(w => w.word === 'tablet')!, starterSkills).eligible).toBe(false);
  expect(evaluate(dictionary.words.find(w => w.word === 'jive')!, starterSkills).eligible).toBe(false);
  expect(evaluate(dictionary.words.find(w => w.word === 'the')!, starterSkills).eligible).toBe(false);
});
