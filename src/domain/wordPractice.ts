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
  group: number;
  passStart: number;
  translation: TranslationUnit;
  correct: boolean;
  expected: string;
  scored: boolean;
}
export interface PracticePrompt {
  id: string;
  start: number;
  end: number;
  pass: number;
  sourceStart: number;
  preview: boolean;
  recovering: boolean;
  error: boolean;
  progress: number;
  required: number;
}
export interface WordPracticeProjection {
  prompt: PracticePrompt;
  cells: PracticeCell[];
  attempts: WordAttempt[];
  current: number;
  offset: number;
  hint: number;
  progress: number;
  groupStart: number;
  groupEnd: number;
  groupWrong: boolean;
  required: number;
  recovering: boolean;
  dotError: boolean;
  completed: number;
  done: boolean;
  correct: number;
  correctChars: number;
  translatedText: string;
}
export const wordPracticeDefaults = (): WordPracticeOptions => ({ inputMode: 'text', groupSize: 1, repetitions: 1, requireCorrect: false, repeatOnError: false, errorRepetitions: 3 });
export const assistedPractice = (options: Partial<WordPracticeOptions>) => (options.groupSize || 1) > 1 || options.inputMode === 'steno' || (options.repetitions || 1) > 1 || Boolean(options.requireCorrect) || Boolean(options.repeatOnError);
const equal = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();

// Anchors survive corrections: fixing a failed attempt cannot restore the
// consecutive successes discarded by that failure. They reset with the test.
// Group's first target index -> native source offset of its latest failed pass.
export type RecoveryHistory = ReadonlyMap<number, number>;
export function rebaseRecovery(history: RecoveryHistory, before: string, after: string): Map<number, number> {
  let prefix = 0, suffix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const oldEnd = before.length - suffix, delta = after.length - before.length;
  return new Map([...history].map(([target, anchor]) => [target,
    anchor <= prefix ? anchor : anchor >= oldEnd ? anchor + delta : prefix]));
}

/** Replay the native buffer; never destructively consume an attempt or a retry. */
export function projectWordPractice(targets: PracticeWord[], translated: TranslationResult, options: WordPracticeOptions, finalized = false, history: RecoveryHistory = new Map()): WordPracticeProjection {
  const cells: PracticeCell[] = [];
  const attempts: WordAttempt[] = [];
  const size = options.groupSize;
  let groupStart = 0, groupEnd = Math.min(size, targets.length), target = 0;
  let progress = 0, offset = 0, hint = 0, correct = 0, correctChars = 0;
  let floor = options.repeatOnError ? history.get(0) : undefined;
  let recovering = floor !== undefined, dotError = recovering;
  let required = recovering ? Math.max(options.repetitions, options.errorRepetitions) : options.repetitions;
  let passStart = 0, passFailed = false, newPass = true, pass = 0;
  let preview: PracticePrompt | undefined;
  const clearPass = () => {
    for (let n = groupStart; n < groupEnd; n++) cells[n] = { typed: '', annotation: '', wrong: false, neutral: false, complete: false };
  };
  for (let i = 0; i < translated.units.length && groupStart < targets.length; i++) {
    const unit = translated.units[i], expected = targets[target].word;
    if (newPass) {
      passStart = unit.start; passFailed = false; newPass = false;
      clearPass();
    }
    const matches = unit.status === 'resolved' && equal(unit.text, expected);
    const neutral = options.inputMode === 'steno' && !unit.submitted && !matches;
    const typed = unit.text || unit.source;
    const wrong = !neutral && (unit.submitted ? !matches : !expected.toLowerCase().startsWith(typed.toLowerCase()));
    const cell: PracticeCell = cells[target] = { typed: neutral ? '' : typed, annotation: neutral ? unit.source : wrong ? typed : '', wrong, neutral, complete: false };
    offset = neutral ? 0 : Math.min(typed.length, expected.length);
    dotError ||= wrong;
    if (!unit.submitted && !matches) { hint = target; break; }
    if (!matches) {
      passFailed = true;
      // Remember the start of the failed pass, so editing its mistake starts a
      // fresh streak without reviving correct passes discarded by that failure.
      if (options.repeatOnError && (floor === undefined || unit.end > floor)) {
        recovering = true; floor = passStart; progress = 0; dotError = true;
        required = Math.max(options.repetitions, options.errorRepetitions);
      }
    }
    const lastWord = target === groupEnd - 1;
    const passCorrect = !passFailed;
    const beforeFloor = floor !== undefined && unit.end <= floor;
    const nextProgress = progress + Number(lastWord && passCorrect && !beforeFloor);
    const passed = lastWord && (nextProgress >= required || (!passCorrect && !options.repeatOnError && options.repetitions === 1 && !options.requireCorrect));
    const finalMatch = matches && passed && groupEnd === targets.length;
    attempts.push({ unit: i, target, group: groupStart, passStart, translation: unit, correct: matches, expected, scored: unit.submitted || finalMatch || finalized && matches });
    if (matches && (unit.submitted || finalMatch || finalized)) { correct++; correctChars += expected.length + 1; }
    if (!matches && options.requireCorrect) {
      cell.annotation = translated.units.slice(i).map(u => u.text || u.source).join(' ');
      hint = target; break;
    }
    if (lastWord && passCorrect && !beforeFloor) { progress = nextProgress; dotError = false; }
    hint = lastWord ? passed ? Math.min(groupEnd, targets.length - 1) : groupStart : target + 1;
    if (lastWord && matches && !unit.submitted && !finalMatch && !finalized) {
      const start = passed ? groupEnd : groupStart;
      const nextRecovering = passed ? Boolean(options.repeatOnError && history.has(start)) : recovering;
      preview = { id: `${start}:${pass + 1}`, start, end: Math.min(start + size, targets.length), pass: pass + 1,
        sourceStart: unit.end, preview: true, recovering: nextRecovering, error: passed ? nextRecovering : dotError,
        progress: passed ? 0 : progress, required: passed ? nextRecovering ? Math.max(options.repetitions, options.errorRepetitions) : options.repetitions : required };
    }
    if (unit.submitted || finalMatch || finalized) {
      cell.complete = matches;
      offset = 0;
      if (!lastWord) { target++; }
      else {
        if (passed) {
          groupStart = groupEnd; groupEnd = Math.min(groupStart + size, targets.length); progress = 0;
          passFailed = false;
          floor = options.repeatOnError ? history.get(groupStart) : undefined;
          recovering = floor !== undefined; dotError = recovering;
          required = recovering ? Math.max(options.repetitions, options.errorRepetitions) : options.repetitions;
        } else if (passCorrect) clearPass();
        target = groupStart; newPass = true; pass++; passStart = unit.end;
      }
      hint = Math.min(target, Math.max(0, targets.length - 1));
    }
  }
  const current = Math.min(target, Math.max(0, targets.length - 1));
  const prompt: PracticePrompt = preview || { id: `${groupStart}:${pass}`, start: groupStart, end: groupEnd, pass, sourceStart: passStart, preview: false, recovering, error: dotError, progress, required };
  return { prompt, cells, attempts, current, offset, hint, progress, groupStart, groupEnd, groupWrong: passFailed || dotError, required, recovering, dotError,
    completed: groupStart, done: targets.length > 0 && groupStart === targets.length, correct, correctChars,
    translatedText: attempts.filter(a => a.scored).map(a => a.translation.text ? a.translation.text + ' ' : '').join(''),
  };
}
export function wordPracticeMetrics(before: WordPracticeProjection, after: WordPracticeProjection) {
  const mistakes: WordMistake[] = [];
  const failures: { target: number; start: number }[] = [];
  let incorrectChars = 0;
  const previousAttempts = new Map(before.attempts.map(a => [a.unit, a]));
  for (const attempt of after.attempts) {
    if (!attempt.translation.submitted || attempt.correct) continue;
    const previous = previousAttempts.get(attempt.unit);
    if (previous && !previous.correct && previous.translation.submitted && previous.target === attempt.target && previous.translation.source === attempt.translation.source) continue;
    failures.push({ target: attempt.group, start: attempt.passStart });
    mistakes.push({ index: attempt.target, typed: attempt.translation.text || attempt.translation.source, expected: attempt.expected });
    if (attempt.translation.text) incorrectChars += attempt.translation.text.length + 1;
  }
  return { mistakes, failures, incorrectChars, inserted: [...insertedText(before.translatedText, after.translatedText)].length };
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
