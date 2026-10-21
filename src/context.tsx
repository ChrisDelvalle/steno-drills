import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Dictionary, HintSize, PracticeWord, Profile, WordEntry } from './domain/types';

export interface SessionConfig {
  title: string;
  kind: 'words' | 'chords' | 'text';
  pool: PracticeWord[];
  mode: 'timed' | 'count';
  duration: number;
  count: number;
  hints: boolean;
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
