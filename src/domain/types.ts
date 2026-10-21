export type Bank = 'initial' | 'vowel' | 'final' | 'special' | 'brief';
export interface Concept {
  id: string;
  label: string;
  bank: Bank;
  position: 'initial' | 'vowel' | 'final' | 'brief';
  keys: string;
  phones: string[];
  starter: boolean;
  description: string;
}
export interface OutlineAnalysis {
  outline: string;
  requirements: string[][];
  reason?: string;
}
export interface WordEntry {
  word: string;
  outlines: OutlineAnalysis[];
  pronunciations: string[][];
  syllables: number[];
  rank?: number;
}
export interface Dictionary {
  version: 1;
  words: WordEntry[];
  report: {
    entries: number;
    words: number;
    monosyllables: number;
    classified: number;
    starter: number;
    starterCommon: number;
    missingPronunciation: number;
    unexplained: number;
  };
}
export interface WordCorrection {
  word: string;
  outlines: string[];
  syllables: number;
  pronunciation: string;
}
export interface WordList { id: string; name: string; words: string[] }
export interface Filter {
  pool: 'common' | 'all';
  focus: string;
  minLength: number;
  maxLength: number;
}
export interface SavedExercise { id: string; name: string; filter: Filter }
export interface Profile {
  version: 1;
  learned: string[];
  lists: WordList[];
  exercises: SavedExercise[];
  corrections: WordCorrection[];
  excluded: string[];
  filter: Filter;
  theme: 'system' | 'light' | 'dark';
  customText: string;
  session: { mode: 'timed' | 'count'; duration: number; count: number; hints: boolean };
}
export interface Evaluation {
  eligible: boolean;
  outline?: string;
  requirements: string[];
  missing: string[];
  reason: string;
}
export interface PracticeWord { word: string; outline?: string }
