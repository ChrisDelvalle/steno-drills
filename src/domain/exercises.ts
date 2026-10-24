import data from '../../data/exercises.json';
import type { PracticeWord, WordEntry } from './types';
import { parseStroke } from './classifier';
import { shuffled } from './practice';

export const builtInExercises = [
  ['bank', 'Words'], ['drills', 'Word drills'], ['chords', 'Keys / chords'], ['fingers', 'Finger drills'],
  ['sentences', 'Sentences'], ['two-key', 'Two-key sentences'], ['quotes', 'Quotes'],
  ['numbers', 'Numbers'], ['number-sentences', 'Number sentences'], ['symbols', 'Symbols'], ['text', 'Custom text'],
] as const;

const labels: Record<string, string> = {
  'd-/b-': 'D / B', '-ld/-lt': 'LD / LT', nch: 'NCH', '-nj': 'NJ', 'ite/ight': 'ITE / IGHT',
  'st/sp': 'ST / SP', 'AI/OE/EE': 'Long vowels', shortAndLongA: 'Short / long A',
  oneAndTwoKey: 'One / two keys', oneOrTwoKeys: 'One / two keys (review)',
  singleStrokeCVC: 'Single-key CVC', multiStrokeCVC: 'Multi-stroke CVC',
};
export const wordDrills = Object.entries(data.wordSets)
  .filter(([id]) => !id.startsWith('Da Dreaded') && id !== 'twoKeySentences' && !id.endsWith('Alt'))
  .map(([id, words]) => ({ id, words, label: labels[id] || id.replace('Learn Plover: ', '').replace('Intro: ', '').replace(/_SingleSyllable$/, ' words').replace(/^SingleSyllable_/, 'Final ').replace(/^CommonBriefs_/, 'Briefs ').replaceAll('_', ' '), group: id.startsWith('Learn Plover:') ? 'Learn Plover' : id.startsWith('Intro:') ? 'Intro' : 'Word drills' }));
export const fingerSections = data.fingers;
export const techniqueSections = data.technique;
export const invalidStrokes = (patterns: string[]) => [...new Set(patterns.flatMap(pattern => pattern.toUpperCase().split('/')).filter(stroke => !parseStroke(stroke)))];
export function fingerSequence(patterns: string[], repeats: number): PracticeWord[] {
  if (invalidStrokes(patterns).length) return [];
  return patterns.flatMap(pattern => {
    const strokes = pattern.toUpperCase().split('/').filter(Boolean);
    if (!strokes.length || strokes.some(stroke => !parseStroke(stroke))) return [];
    return Array.from({ length: repeats }, () => strokes.map(word => ({ word, outline: word }))).flat();
  });
}
export const keyboardSets: Record<string, string[]> = {
  'Left hand': ['S','T','K','P','W','H','R'],
  'Right hand': ['-F','-R','-P','-B','-L','-G','-T','-S','-D','-Z'],
  Vowels: ['A','O','E','U'],
  'Left bottom row': ['S','K','W','R'], 'Left top row': ['S','T','P','H'],
  'Right bottom row': ['-R','-B','-G','-S','-Z'], 'Right top row': ['-F','-P','-L','-T','-D'],
};
const normalize = (text: string) => text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
export function textWords(text: string, wordMap: Map<string, WordEntry>): PracticeWord[] {
  return normalize(text).split(/\s+/).filter(Boolean).map(word => ({ word, outline: wordMap.get(word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, ''))?.outlines[0]?.outline }));
}
export async function sentencePassage(count: number, random = Math.random) {
  const { default: sentences } = await import('../../data/sentences.json');
  const chosen: string[] = []; let length = 0;
  for (const sentence of shuffled(sentences, random)) {
    chosen.push(sentence); length += sentence.split(/\s+/).length;
    if (length >= count) break;
  }
  return { text: chosen.join(' '), source: 'Project Gutenberg · original exercise collection' };
}
export async function quotePassage(length: 'short' | 'medium' | 'long', random = Math.random) {
  const { default: allQuotes } = await import('../../data/quotes.json');
  const quotes = allQuotes.filter(q => length === 'short' ? q.text.length <= 100 : length === 'medium' ? q.text.length > 100 && q.text.length <= 300 : q.text.length > 300);
  const quote = quotes[Math.min(quotes.length - 1, Math.floor(random() * quotes.length))];
  return { text: quote?.text || '', source: quote?.source || '' };
}
export const twoKeyText = data.twoKeyText;
export function numberPassage(count: number, random = Math.random) {
  const nouns = ['books','chairs','birds','trees','cars','boxes','tickets','apples'];
  const lines: string[] = []; let words = 0;
  while (words < count) {
    const n = 1 + Math.floor(random() * 99), noun = nouns[Math.floor(random() * nouns.length)];
    const item = n === 1 ? (noun === 'boxes' ? 'box' : noun.slice(0, -1)) : noun;
    const options = [`We counted ${n} ${item}.`, `Please bring ${n} ${item}.`, `The order includes ${n} ${item}.`];
    const line = options[Math.floor(random() * options.length)]; lines.push(line); words += line.split(/\s+/).length;
  }
  return lines.join(' ');
}
const symbolRows = {
  FPBL: '↑←→↓', FR: '!¬↦¡', FP: '"“”„', FRLG: '#©®™', RPBL: '$¥€£', FRPB: '%‰‱φ',
  FBG: '&∩∧∈', F: "'‘’‚", FPL: '([<{', RBG: ')]>}', L: '*∏§×', G: '+∑¶±', B: ',∪∨∉',
  PL: '-−–—', R: '.•·…', RP: '/⇒⇔÷', LG: ':∋∵∴', RB: ';∀∃∄', PBLG: '=≡≈≠',
  FPB: '?¿∝‽', FRPBLG: '@⊕⊗∅', FB: '\\Δ√∞', RPG: '^«»°', BG: '_≤≥µ', P: '`⊂⊃π', FPBG: '~⊆⊇˜',
};
export function symbolPool(variants: boolean): PracticeWord[] {
  return Object.entries(symbolRows).flatMap(([final, symbols]) => [...symbols].slice(0, variants ? 4 : 1).map((word, i) => ({ word, outline: `SKWHAO${['','E','U','EU'][i]}${final}` })));
}
