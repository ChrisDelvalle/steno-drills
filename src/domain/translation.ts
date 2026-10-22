import type { WordEntry } from './types';

export interface TranslationUnit {
  source: string;
  start: number;
  end: number;
  submitted: boolean;
  text?: string;
  status: 'resolved' | 'pending' | 'unknown' | 'conflict';
}
export interface TranslationResult { units: TranslationUnit[]; text: string }
// An engine owns translation, not target selection or practice progression.
// Source ranges let a future stateful/formatting engine preserve input editing.
export interface InputTranslator { translate(buffer: string, ignoreQuestions?: boolean): TranslationResult }

function tokenize(buffer: string, ignoreQuestions: boolean) {
  let clean = '';
  const positions: number[] = [];
  for (let i = 0; i < buffer.length; i++) {
    if (ignoreQuestions && buffer[i] === '?') continue;
    positions.push(i); clean += buffer[i];
  }
  return [...clean.matchAll(/\S+/g)].map(match => ({
    source: match[0], start: positions[match.index!], end: positions[match.index! + match[0].length - 1] + 1,
    submitted: /\s/.test(clean[match.index! + match[0].length] || ''),
  }));
}
const result = (units: TranslationUnit[]): TranslationResult => ({ units,
  text: units.map(u => u.text || '').join(' ') + (units.at(-1)?.submitted ? ' ' : ''),
});
export const textTranslator: InputTranslator = { translate: (buffer, ignoreQuestions = false) => result(
  tokenize(buffer, ignoreQuestions).map(unit => ({ ...unit, text: unit.source, status: 'resolved' })),
) };

export function createOutlineTranslator(entries: WordEntry[]): InputTranslator & { hasWord(word: string): boolean } {
  const words = new Map<string, string | null>();
  for (const entry of entries) for (const { outline } of entry.outlines) {
    const key = outline.toUpperCase();
    const previous = words.get(key);
    words.set(key, previous === undefined || previous === entry.word ? entry.word : null);
  }
  const outlines = [...words.keys()].sort();
  const isPrefix = (key: string) => {
    let lo = 0, hi = outlines.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (outlines[mid] < key) lo = mid + 1; else hi = mid; }
    return outlines[lo]?.startsWith(key) || false;
  };
  const supported = new Set([...words.values()].filter((word): word is string => word !== null));
  return { hasWord: word => supported.has(word.toLowerCase()), translate(buffer, ignoreQuestions = false) {
    return result(tokenize(buffer, ignoreQuestions).map(unit => {
      const key = unit.source.toUpperCase(), text = words.get(key);
      if (text) return { ...unit, text, status: 'resolved' };
      return { ...unit, status: text === null ? 'conflict' : !unit.submitted && isPrefix(key) ? 'pending' : 'unknown' };
    }));
  } };
}
