import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Dictionary, HintSize, PracticeWord, Profile, WordEntry, WordPracticeOptions } from './domain/types';
import type { SharedTest } from './domain/sharing';

export interface SessionConfig extends Partial<WordPracticeOptions> {
  listening?: import('./domain/types').ListeningOptions;
  voice?: string;
  translator?: import('./domain/translation').InputTranslator;
  title: string;
  kind: 'words' | 'chords' | 'text';
  pool: PracticeWord[];
  mode: 'timed' | 'count';
  duration: number;
  count: number;
  hints: boolean;
  questionHints?: boolean;
  lines?: number;
  hintPosition?: 'above' | 'below';
  hintTextSize?: HintSize;
  hintKeyboardSize?: HintSize;
  unrestricted: boolean;
  ordered?: boolean;
  attribution?: string;
}
export interface AppState {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  dictionary: Dictionary;
  words: WordEntry[];
  wordMap: Map<string, WordEntry>;
  testProfile: Profile;
  setTestProfile: Dispatch<SetStateAction<Profile>>;
  testWords: WordEntry[];
  testWordMap: Map<string, WordEntry>;
  shared: SharedTest | null;
  routeHash: (route: string) => string;
  saveShared: () => void;
  exitShared: () => void;
  source: string;
  setSource: (source: string) => void;
  goPractice: (source?: string) => void;
  warning: string;
  replaceProfile: (profile: Profile) => void;
}
export const AppContext = createContext<AppState | null>(null);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('App context is unavailable.');
  return context;
}
