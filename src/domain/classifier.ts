import { concepts } from './concepts';
import type { OutlineAnalysis, WordEntry } from './types';

export const phoneSet = new Set('AA AE AH AO AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z ZH'.split(' '));
export const isVowel = (p: string) => /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)$/.test(p.replace(/[012]$/, ''));
export const syllableCount = (phones: string[]) => phones.filter(isVowel).length;

export function parseStroke(outline: string) {
  const match = /^(S?T?K?P?W?H?R?)(A?O?\*?E?U?)(-?)(F?R?P?B?L?G?T?S?D?Z?)$/.exec(outline);
  if (!match || !outline || outline === '-' || (match[2] && match[3]) || (!match[2] && match[4] && !match[3])) return null;
  return { initial: match[1], vowel: match[2].replace('*', ''), final: match[4], star: match[2].includes('*') };
}

export function analyzeOutline(word: string, outline: string, pronunciations: string[][]): OutlineAnalysis {
  const brief = concepts.find(c => c.bank === 'brief' && c.label === word && c.keys === outline);
  if (brief) return { outline, requirements: [[brief.id]] };
  if (outline.includes('/')) return { outline, requirements: [], reason: 'Multiple strokes' };
  const stroke = parseStroke(outline);
  if (!stroke) return { outline, requirements: [], reason: 'Unsupported outline syntax' };
  if (!pronunciations.length) return { outline, requirements: [], reason: 'Pronunciation unknown' };
  const analyses = new Map<string, string[]>();
  for (const pronunciation of pronunciations) {
    const phones = pronunciation.map(p => p.replace(/[012]$/, ''));
    if (syllableCount(phones) !== 1) continue;
    const nucleus = phones.findIndex(isVowel);
    const sounds = { initial: phones.slice(0, nucleus).join(' '), vowel: phones[nucleus], final: phones.slice(nucleus + 1).join(' ') };
    const matches = (position: 'initial' | 'vowel' | 'final') => {
      if (!sounds[position] && !stroke[position]) return [null];
      return concepts.filter(c => c.position === position && c.keys.replace(/[-*]/g, '') === stroke[position]
        && c.phones.includes(sounds[position])
        // A short O standing for /AH/ follows Plover's spelling convention;
        // don't generalize it to words without a written O.
        && !(position === 'vowel' && c.id === 'vowel.o' && sounds.vowel === 'AH' && !word.includes('o')));
    };
    for (const initial of matches('initial')) for (const vowel of matches('vowel')) for (const final of matches('final')) {
      const selected = [initial, vowel, final].filter(c => c !== null);
      const starRules = selected.filter(c => c.keys.includes('*')).length;
      if (stroke.star ? starRules !== 1 : starRules !== 0) continue;
      const ids = selected.map(c => c.id);
      analyses.set(ids.join(','), ids);
    }
  }
  return { outline, requirements: [...analyses.values()], ...(!analyses.size ? { reason: 'Unexplained rule or brief' } : {}) };
}

export function makeEntry(word: string, outlines: string[], pronunciations: string[][], rank?: number): WordEntry {
  return {
    word, pronunciations, syllables: [...new Set(pronunciations.map(syllableCount))].sort((a, b) => a - b),
    outlines: outlines.map(o => analyzeOutline(word, o, pronunciations)), ...(rank === undefined ? {} : { rank }),
  };
}
