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
  conceptExamples?: Record<string, ConceptExample>;
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
export interface ConceptExample { word: string; outline: string }
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
  concepts?: { mode: 'personal' | 'single' | 'starter' | 'all' | 'custom'; selected: string[] };
}
export interface SavedExercise { id: string; name: string; filter: Filter }
export interface PracticePreferences {
  source: string;
  restricted: boolean;
  drill: string;
  mixed: string[];
  keyboardSet: string;
  fingerBook: 'duo' | 'technique' | 'custom';
  section: number;
  pattern: number;
  repeats: number;
  customPatterns: string;
  quoteLength: 'short' | 'medium' | 'long';
  symbolVariants: boolean;
}
export interface WordPracticeOptions {
  inputMode: 'text' | 'steno';
  repetitions: number;
  requireCorrect: boolean;
  repeatOnError: boolean;
  errorRepetitions: number;
}
export type HintSize = 'small' | 'medium' | 'large' | 'extra-large';
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
  practice: PracticePreferences;
  session: WordPracticeOptions & { mode: 'timed' | 'count'; duration: number; count: number; hints: boolean; lines: number; hintPosition: 'above' | 'below'; hintTextSize: HintSize; hintKeyboardSize: HintSize };
}
export interface Evaluation {
  eligible: boolean;
  outline?: string;
  requirements: string[];
  missing: string[];
  reason: string;
}
export interface PracticeWord { word: string; outline?: string }
