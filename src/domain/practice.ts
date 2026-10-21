import type { PracticeWord } from './types';

export function shuffled<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateWords(pool: PracticeWord[], count: number, random = Math.random): PracticeWord[] {
  if (!pool.length) return [];
  const result: PracticeWord[] = [];
  while (result.length < count) {
    const cycle = shuffled(pool, random);
    if (cycle.length > 1 && result.at(-1)?.word === cycle[0].word) [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    result.push(...cycle.slice(0, count - result.length));
  }
  return result;
}

export function scoreInput(expected: PracticeWord[], input: string, elapsedMs: number) {
  const typed = input.trimStart().split(/\s+/);
  const trailingSpace = /\s$/.test(input);
  const tokens = input.trim() ? (trailingSpace ? typed.slice(0, -1) : typed) : [];
  const exact = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const committed = Math.min(expected.length, trailingSpace ? tokens.length : Math.max(0, tokens.length - 1));
  const lastMatches = tokens.length === expected.length && exact(tokens.at(-1) || '', expected.at(-1)?.word || '');
  const completed = Math.min(expected.length, lastMatches ? tokens.length : committed);
  const missed = expected.slice(0, completed).filter((target, i) => !exact(tokens[i] || '', target.word));
  const correct = completed - missed.length;
  const correctChars = expected.slice(0, completed).reduce((n, target, i) => n + (exact(tokens[i] || '', target.word) ? target.word.length + 1 : 0), 0);
  const minutes = elapsedMs / 60_000;
  const rawChars = tokens.slice(0, completed).reduce((sum, token) => sum + token.length + 1, 0);
  return {
    tokens, completed, correct, missed, current: Math.min(completed, expected.length - 1),
    done: expected.length > 0 && completed === expected.length,
    wpm: minutes > 0 ? correctChars / 5 / minutes : 0,
    rawWpm: minutes > 0 ? rawChars / 5 / minutes : 0,
    correctChars, rawChars,
    accuracy: completed ? correct / completed * 100 : 100,
  };
}

// Plover supplies the separator with the following translation. A complete
// matching token can reveal the next hint before that separator arrives.
export function hintTargetIndex(expected: PracticeWord[], tokens: string[], current: number, caretOffset: number) {
  const target = expected[current]?.word;
  const complete = target !== undefined && tokens[current]?.toLowerCase() === target.toLowerCase() && caretOffset === [...target].length;
  return Math.min(current + Number(complete), Math.max(0, expected.length - 1));
}

export interface SpeedSample { seconds: number; wpm: number; raw: number; burst: number; errors: number }
export interface WordMistake { index: number; typed: string; expected: string }
export interface ErrorSample { seconds: number; count: number; mistakes: WordMistake[] }
export interface TypingEvent { at: number; characters: number }
export function inputMetrics(expected: PracticeWord[], previous: string, next: string) {
  let prefix = 0, suffix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++;
  while (suffix < previous.length - prefix && suffix < next.length - prefix && previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  const before = scoreInput(expected, previous, 0), after = scoreInput(expected, next, 0);
  const mistakes = expected.slice(0, after.completed).flatMap((word, i): WordMistake[] => {
    const newlySubmitted = i >= before.completed || before.tokens[i]?.toLowerCase() !== after.tokens[i]?.toLowerCase();
    const typed = after.tokens[i] || '';
    return newlySubmitted && word.word.toLowerCase() !== typed.toLowerCase() ? [{ index: i, typed, expected: word.word }] : [];
  });
  return { inserted: [...next.slice(prefix, next.length - suffix)].length, errors: mistakes.length, mistakes };
}
export function burstSpeed(events: TypingEvent[], elapsedMs: number) {
  return events.filter(e => (elapsedMs <= 1000 ? e.at >= 0 : e.at > elapsedMs - 1000) && e.at <= elapsedMs).reduce((sum, e) => sum + e.characters, 0) * 12;
}
export function speedSample(expected: PracticeWord[], input: string, elapsedMs: number, burst = 0, errors = 0): SpeedSample {
  const score = scoreInput(expected, input, elapsedMs);
  return { seconds: Math.round(elapsedMs / 100) / 10, wpm: score.wpm, raw: score.rawWpm, burst, errors };
}
