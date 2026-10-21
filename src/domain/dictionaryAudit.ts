import { parseStroke } from './classifier';
import { concepts, starterSkills } from './concepts';
import type { ConceptExample, WordEntry } from './types';

export function auditDictionary(words: WordEntry[], main: Record<string, string>, commands: Record<string, string>) {
  const translations = { ...main, ...commands };
  const examples: Record<string, ConceptExample> = {};
  const scores = new Map<string, number[]>();
  const starter = new Set(starterSkills);
  let outlines = 0;
  for (const entry of words) for (const outline of entry.outlines) {
    if (translations[outline.outline] !== entry.word) throw new Error(`Dictionary mismatch: ${outline.outline} does not translate to ${entry.word}.`);
    outlines++;
    if (entry.syllables.length !== 1 || entry.syllables[0] !== 1) continue;
    for (const analysis of outline.requirements) for (const id of analysis) {
      const score = [analysis.filter(other => other !== id && !starter.has(other)).length, entry.rank ?? 1_000_000, entry.word.length, outline.outline.length];
      const previous = scores.get(id);
      const difference = previous ? score.map((n, i) => n - previous[i]).find(n => n !== 0) ?? 0 : -1;
      if (!previous || difference < 0) { examples[id] = { word: entry.word, outline: outline.outline }; scores.set(id, score); }
    }
  }
  for (const concept of concepts) {
    const stroke = parseStroke(concept.keys);
    if (!stroke) throw new Error(`Invalid concept chord: ${concept.id}.`);
    if (concept.position === 'initial' && (stroke.initial !== concept.keys || stroke.vowel || stroke.final || stroke.star)) throw new Error(`Wrong initial bank: ${concept.id}.`);
    if (concept.position === 'vowel' && (stroke.vowel !== concept.keys || stroke.initial || stroke.final || stroke.star)) throw new Error(`Wrong vowel bank: ${concept.id}.`);
    if (concept.position === 'final' && (stroke.initial || stroke.vowel || `${stroke.star ? '*' : ''}${stroke.final}` !== concept.keys.replace(/^-/, ''))) throw new Error(`Wrong final bank: ${concept.id}.`);
    if (concept.position === 'brief' && translations[concept.keys] !== concept.label) throw new Error(`Brief mismatch: ${concept.keys} translates to ${translations[concept.keys]}, not ${concept.label}.`);
    if (!examples[concept.id]) throw new Error(`No dictionary evidence for concept: ${concept.id}.`);
  }
  return { examples, outlines, commandEntries: Object.keys(commands).length };
}
