import type { PracticeWord, WordPracticeOptions } from './types';
import type { TranslationResult, TranslationUnit } from './translation';
import { insertedText } from './practice';
import type { WordMistake } from './practice';

export interface PracticeCell {
  typed: string;
  annotation: string;
  wrong: boolean;
  neutral: boolean;
  complete: boolean;
}
export interface WordAttempt {
  unit: number;
  target: number;
  translation: TranslationUnit;
  correct: boolean;
  expected: string;
  scored: boolean;
}
export interface WordPracticeProjection {
  cells: PracticeCell[];
  attempts: WordAttempt[];
  current: number;
  offset: number;
  hint: number;
  progress: number;
  completed: number;
  done: boolean;
  correct: number;
  correctChars: number;
  translatedText: string;
}
export const wordPracticeDefaults = (): WordPracticeOptions => ({ inputMode: 'text', repetitions: 1, requireCorrect: false });
export const assistedPractice = (options: Partial<WordPracticeOptions>) => options.inputMode === 'steno' || (options.repetitions || 1) > 1 || Boolean(options.requireCorrect);
const equal = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();

/** Replay the native buffer; never destructively consume an attempt or a retry. */
export function projectWordPractice(targets: PracticeWord[], translated: TranslationResult, options: WordPracticeOptions, finalized = false): WordPracticeProjection {
  const cells: PracticeCell[] = [];
  const attempts: WordAttempt[] = [];
  let target = 0, progress = 0, offset = 0, hint = 0, correct = 0, correctChars = 0;
  for (let i = 0; i < translated.units.length && target < targets.length; i++) {
    const unit = translated.units[i], expected = targets[target].word;
    const matches = unit.status === 'resolved' && equal(unit.text, expected);
    const neutral = options.inputMode === 'steno' && !unit.submitted && !matches;
    const typed = unit.text || unit.source;
    const wrong = !neutral && (unit.submitted ? !matches : !expected.toLowerCase().startsWith(typed.toLowerCase()));
    const cell: PracticeCell = cells[target] = { typed: neutral ? '' : typed, annotation: neutral ? unit.source : wrong ? typed : '', wrong, neutral, complete: false };
    offset = neutral ? 0 : Math.min(typed.length, expected.length);
    if (!unit.submitted && !matches) { hint = target; break; }
    const nextProgress = progress + Number(matches);
    const finalMatch = matches && nextProgress === options.repetitions && target === targets.length - 1;
    attempts.push({ unit: i, target, translation: unit, correct: matches, expected, scored: unit.submitted || finalMatch || finalized && matches });
    if (matches && (unit.submitted || finalMatch || finalized)) { correct++; correctChars += expected.length + 1; }
    if (!matches && options.requireCorrect) {
      cell.annotation = translated.units.slice(i).map(u => u.text || u.source).join(' ');
      hint = target; break;
    }
    if (matches) progress++;
    const passed = progress >= options.repetitions || (!matches && options.repetitions === 1 && !options.requireCorrect);
    hint = Math.min(target + Number(passed), Math.max(0, targets.length - 1));
    if (passed && (unit.submitted || finalMatch || finalized)) {
      cell.complete = true; target++; progress = 0; offset = 0;
    } else if (unit.submitted) offset = 0;
  }
  const current = Math.min(target, Math.max(0, targets.length - 1));
  return { cells, attempts, current, offset, hint: Math.max(current, hint), progress,
    completed: target, done: targets.length > 0 && target === targets.length, correct, correctChars,
    translatedText: attempts.filter(a => a.scored).map(a => a.translation.text ? a.translation.text + ' ' : '').join(''),
  };
}
export function wordPracticeMetrics(before: WordPracticeProjection, after: WordPracticeProjection) {
  const mistakes: WordMistake[] = [];
  let incorrectChars = 0;
  const previousAttempts = new Map(before.attempts.map(a => [a.unit, a]));
  for (const attempt of after.attempts) {
    if (!attempt.translation.submitted || attempt.correct) continue;
    const previous = previousAttempts.get(attempt.unit);
    if (previous && !previous.correct && previous.translation.submitted && previous.target === attempt.target && previous.translation.source === attempt.translation.source) continue;
    mistakes.push({ index: attempt.target, typed: attempt.translation.text || attempt.translation.source, expected: attempt.expected });
    if (attempt.translation.text) incorrectChars += attempt.translation.text.length + 1;
  }
  return { mistakes, incorrectChars, inserted: [...insertedText(before.translatedText, after.translatedText)].length };
}
export function scoreWordPractice(projection: WordPracticeProjection, targets: PracticeWord[], elapsedMs: number, mistakes: WordMistake[], incorrectChars: number) {
  const minutes = elapsedMs / 60_000;
  return { tokens: projection.cells.map(c => c?.typed || ''), completed: projection.completed, correct: projection.correct,
    done: projection.done, missed: mistakes.flatMap(m => targets[m.index] ? [targets[m.index]] : []),
    correctChars: projection.correctChars, rawChars: projection.correctChars + incorrectChars,
    wpm: minutes > 0 ? projection.correctChars / 5 / minutes : 0,
    rawWpm: minutes > 0 ? (projection.correctChars + incorrectChars) / 5 / minutes : 0,
    accuracy: projection.correct + mistakes.length ? projection.correct / (projection.correct + mistakes.length) * 100 : 100,
  };
}
