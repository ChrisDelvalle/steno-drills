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
  return {
    tokens, completed, correct, missed, current: Math.min(completed, expected.length - 1),
    done: expected.length > 0 && completed === expected.length,
    wpm: minutes > 0 ? correctChars / 5 / minutes : 0,
    accuracy: completed ? correct / completed * 100 : 100,
  };
}
