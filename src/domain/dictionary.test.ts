import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { starterSkills } from './concepts';
import { evaluate } from './vocabulary';
import type { Dictionary } from './types';
import { auditDictionary } from './dictionaryAudit';
import { concepts } from './concepts';
import { parseStroke } from './classifier';

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
it('verifies every indexed outline and every skill against the pinned Plover sources', () => {
  const main = JSON.parse(readFileSync(resolve('data/sources/plover.json'), 'utf8'));
  const commands = JSON.parse(readFileSync(resolve('data/sources/plover-commands.json'), 'utf8'));
  const audit = auditDictionary(dictionary.words, main, commands);
  expect(audit.outlines).toBe(117902);
  expect(audit.commandEntries).toBe(37);
  expect(Object.keys(audit.examples)).toHaveLength(concepts.length);
  expect(dictionary.conceptExamples).toEqual(audit.examples);
  for (const concept of concepts) {
    const example = audit.examples[concept.id];
    expect(main[example.outline], concept.id).toBe(example.word);
    expect(dictionary.words.find(w => w.word === example.word)!.outlines.find(o => o.outline === example.outline)!.requirements.some(r => r.includes(concept.id)), concept.id).toBe(true);
  }
  expect(concepts.find(c => c.id === 'initial.j')!.keys).toBe('SKWR');
  expect(parseStroke(audit.examples['initial.j'].outline)!.initial).toBe('SKWR');
  expect(concepts.find(c => c.id === 'brief.be')!.keys).toBe('-B');
  expect(main['-B']).toBe('be'); expect(main.PW).toBe('about');
  expect(() => auditDictionary(dictionary.words, { ...main, '-B': 'about' }, commands)).toThrow('Dictionary mismatch');
  expect(() => auditDictionary(dictionary.words, main, { ...commands, PWAD: '{#Return}' })).toThrow('Dictionary mismatch');
});
