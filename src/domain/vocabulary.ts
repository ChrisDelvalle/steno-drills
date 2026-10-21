import { analyzeOutline } from './classifier';
import type { Evaluation, Filter, Profile, WordEntry } from './types';

export function evaluate(entry: WordEntry, learned: string[], excluded: string[] = []): Evaluation {
  const empty = { eligible: false, requirements: [], missing: [] };
  if (excluded.includes(entry.word)) return { ...empty, reason: 'Personally excluded' };
  if (!entry.syllables.length) return { ...empty, reason: 'Syllable count unknown' };
  if (entry.syllables.length > 1) return { ...empty, reason: 'Conflicting syllable counts' };
  if (entry.syllables[0] !== 1) return { ...empty, reason: 'More than one syllable' };
  const known = new Set(learned);
  let best: Evaluation | undefined;
  const sorted = [...entry.outlines].sort((a, b) => a.outline.length - b.outline.length || a.outline.localeCompare(b.outline));
  for (const analysis of sorted) for (const requirements of analysis.requirements) {
    const missing = requirements.filter(id => !known.has(id));
    if (!missing.length) return { eligible: true, outline: analysis.outline, requirements, missing: [], reason: 'Ready to practice' };
    if (!best || missing.length < best.missing.length) best = { ...empty, outline: analysis.outline, requirements, missing, reason: 'Concepts still to learn' };
  }
  return best || { ...empty, reason: entry.outlines.every(o => o.reason === 'Multiple strokes') ? 'Needs multiple strokes' : 'Needs rule review' };
}

export function applyCorrections(words: WordEntry[], profile: Profile): WordEntry[] {
  if (!profile.corrections.length) return words;
  const entries = new Map(words.map(w => [w.word, w]));
  for (const correction of profile.corrections) {
    const previous = entries.get(correction.word);
    const pronunciations = correction.pronunciation.trim() ? [correction.pronunciation.trim().split(/\s+/)] : previous?.pronunciations || [];
    entries.set(correction.word, {
      word: correction.word, syllables: [correction.syllables], pronunciations, rank: previous?.rank,
      outlines: correction.outlines.map(o => analyzeOutline(correction.word, o, pronunciations)),
    });
  }
  return [...entries.values()].sort((a, b) => a.word.localeCompare(b.word));
}

export function matchesFilter(entry: WordEntry, evaluation: Evaluation, filter: Filter) {
  if (filter.pool === 'common' && entry.rank === undefined) return false;
  if (entry.word.length < filter.minLength || entry.word.length > filter.maxLength) return false;
  return !filter.focus || evaluation.requirements.includes(filter.focus);
}

export function eligibleWords(words: WordEntry[], profile: Profile, filter: Filter = profile.filter) {
  return words.flatMap(entry => {
    const matching = evaluateForFocus(entry, profile, filter.focus);
    return matching.eligible && matchesFilter(entry, matching, filter) ? [{ word: entry.word, outline: matching.outline }] : [];
  });
}

// Focus may select a different qualifying outline than the default hint.
export function evaluateForFocus(entry: WordEntry, profile: Profile, focus: string) {
  const focused = focus ? { ...entry, outlines: entry.outlines.map(a => ({ ...a, requirements: a.requirements.filter(r => r.includes(focus)) })) } : entry;
  return evaluate(focused, profile.learned, profile.excluded);
}

export const parseWordList = (text: string) => [...new Set(text.toLowerCase().split(/[\s,;]+/).map(w => w.replace(/^[^a-z]+|[^a-z]+$/g, '')).filter(w => /^[a-z]+(?:['-][a-z]+)*$/.test(w)))];
