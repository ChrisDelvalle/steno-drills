import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PracticeWord } from '../domain/types';
import { passageWindow, wrapPassage } from '../domain/passage';
import type { PassageLine } from '../domain/passage';
import { hintTargetIndex, practiceText } from '../domain/practice';
import type { PracticeCell, WordPracticeProjection } from '../domain/wordPractice';
import { Icon } from '../components';

const MeasureWords = memo(function MeasureWords({ targets }: { targets: PracticeWord[] }) {
  // Match the displayed letter spans exactly: fractional glyph rounding can
  // differ between one text node and a series of letter spans at small sizes.
  return <>{targets.map((target, i) => <span key={i}>{[...target.word].map((letter, n) => <span key={n}>{letter}</span>)}</span>)}</>;
});

const Word = memo(function Word({ word, typed = '', complete, active, offset, width, view, repetitions = 1, progress = 0, showDots = repetitions > 1, dotError = false, recovering = false, group, segmentEnd = false }: {
  word: string; typed?: string; complete: boolean; active: boolean; offset: number;
  width?: number; view?: PracticeCell; repetitions?: number; progress?: number; showDots?: boolean; dotError?: boolean; recovering?: boolean; group?: { first: boolean; last: boolean; wrong: boolean }; segmentEnd?: boolean;
}) {
  const cell = useRef<HTMLSpanElement>(null);
  const annotation = useRef<HTMLSpanElement>(null);
  typed = view?.typed ?? typed;
  complete = view?.complete ?? complete;
  const dots = useRef<HTMLSpanElement>(null);
  const wrong = view?.wrong ?? (Boolean(typed) && (complete ? word.toLowerCase() !== typed.toLowerCase() : !word.toLowerCase().startsWith(typed.toLowerCase())));
  const [feedback, setFeedback] = useState({ progress, error: false });
  const exact = typed.toLowerCase() === word.toLowerCase();
  const showError = dotError || wrong || (feedback.progress === progress && feedback.error && !exact);
  useLayoutEffect(() => {
    setFeedback(current => current.progress === progress && current.error === (active && showError) ? current : { progress, error: active && showError });
  }, [active, progress, showError]);
  const annotationText = view?.annotation ?? (wrong ? typed : '');
  const letters = [...word];
  useLayoutEffect(() => {
    if (!active || !showDots || !dots.current || !cell.current) return;
    const wordCell = cell.current, indicator = dots.current;
    const frame = wordCell.closest('.target-words')!;
    const fit = () => {
      const bounds = frame.getBoundingClientRect(), box = wordCell.getBoundingClientRect();
      const half = indicator.getBoundingClientRect().width / 2;
      const center = Math.max(bounds.left + half, Math.min(bounds.right - half, box.left + box.width / 2));
      indicator.style.left = `${center - box.left}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit); observer.observe(frame); observer.observe(wordCell);
    return () => observer.disconnect();
  }, [active, repetitions, width, showDots]);
  useLayoutEffect(() => {
    if (!annotationText || !cell.current || !annotation.current) return;
    const fit = () => {
      if (!cell.current || !annotation.current) return;
      const width = cell.current.getBoundingClientRect().width;
      annotation.current.style.fontSize = '12px';
      if (width > 0) annotation.current.style.fontSize = `${Math.max(9, Math.min(12, 12 * width / Math.max(1, annotation.current.scrollWidth)))}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit); observer.observe(cell.current);
    return () => observer.disconnect();
  }, [annotationText]);
  return <span ref={cell} style={{ width }} title={word} className={`practice-word${wrong ? ' wrong' : complete ? ' correct' : ''}`}>
    {annotationText && <span className={`word-mistake${view?.neutral ? ' pending' : ''}`} ref={annotation} title={annotationText} aria-hidden="true">{annotationText}</span>}
    {active && showDots && <span ref={dots} className="repetition-dots" data-recovery={recovering} role="status" aria-description={`${showError ? 'Incorrect attempt. ' : ''}${recovering ? 'Consecutive correct passes required.' : ''}`} aria-label={`${progress} of ${repetitions} repetitions`} title={`${progress} of ${repetitions} ${recovering ? 'consecutive ' : ''}repetitions`}>{Array.from({ length: repetitions }, (_, i) => <span key={i} data-state={i < progress ? 'correct' : i === progress && showError ? 'incorrect' : 'pending'} aria-hidden="true"/>)}</span>}
    {group && <span className="group-bracket" data-first={group.first} data-last={group.last} data-end={segmentEnd} data-wrong={group.wrong} aria-hidden="true"/>}
    <span className="expected-word">{letters.map((letter, i) => <span key={i} className={`${active && i === offset ? 'cursor-before ' : ''}${active && i < offset && !wrong ? 'typed-letter' : ''}`}>{letter}</span>)}{active && offset >= letters.length && <span className="cursor-end"/>}</span>
  </span>;
});

export function PracticeSurface({ targets, input, tokens, completed, onInput, inputRef, lines = 3, onHintChange, questionHints = false, suspended = false, projection, project, repetitions = 1, rawInput = false, repeatOnError = false, groupSize = 1 }: {
  targets: PracticeWord[]; input: string; tokens: string[]; completed: number;
  onInput: (value: string) => void; inputRef: RefObject<HTMLTextAreaElement | null>; lines?: number;
  onHintChange?: (index: number) => void;
  questionHints?: boolean; suspended?: boolean;
  projection?: WordPracticeProjection; project?: (input: string) => WordPracticeProjection; repetitions?: number; rawInput?: boolean; repeatOnError?: boolean; groupSize?: number;
}) {
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ rows: PassageLine[]; widths: number[] }>({ rows: [], widths: [] });
  const prefix = practiceText(input.slice(0, Math.min(caret, input.length)), questionHints).trimStart().split(/\s+/);
  const cursorProjection = projection && project ? project(input.slice(0, Math.min(caret, input.length))) : undefined;
  const current = cursorProjection?.current ?? Math.min(targets.length - 1, Math.max(0, prefix.length - 1));
  const offset = cursorProjection?.offset ?? Math.min([...(prefix.at(-1) || '')].length, [...(targets[current]?.word || '')].length);
  const hintIndex = cursorProjection?.hint ?? hintTargetIndex(targets, tokens, current, offset);
  const unfocused = !focused && !suspended;
  const syncFocus = () => setFocused(document.hasFocus() && document.activeElement === inputRef.current && document.visibilityState !== 'hidden');
  const restoreFocus = () => { inputRef.current?.focus(); setCaret(inputRef.current?.selectionStart || 0); };
  useEffect(() => {
    const blur = () => setFocused(false);
    const focusFromKey = (event: KeyboardEvent) => {
      if (suspended || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('button,a,input,textarea,select,[contenteditable],dialog') || target.tabIndex >= 0)) {
        if (!target.closest('.practice-focus') || event.key.length !== 1) return;
      }
      inputRef.current?.focus();
    };
    window.addEventListener('blur', blur);
    window.addEventListener('focus', syncFocus);
    window.addEventListener('keydown', focusFromKey);
    document.addEventListener('visibilitychange', syncFocus);
    syncFocus();
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', syncFocus);
      window.removeEventListener('keydown', focusFromKey);
      document.removeEventListener('visibilitychange', syncFocus);
    };
  }, [inputRef, suspended]);
  useLayoutEffect(() => { onHintChange?.(hintIndex); }, [hintIndex, onHintChange]);
  useLayoutEffect(() => {
    const frame = surface.current, ruler = measure.current;
    if (!frame || !ruler) return;
    const fit = () => {
      const style = getComputedStyle(frame);
      const font = parseFloat(style.fontSize) || 32;
      const width = frame.getBoundingClientRect().width || 800;
      const widths = [...ruler.children].map((node, i) => {
        const letters = [...node.children].reduce((sum, letter) => sum + letter.getBoundingClientRect().width, 0);
        // A small subpixel allowance keeps overflow ellipses from appearing
        // when the browser rounds each letter and its containing block apart.
        return Math.min(width, (letters || [...targets[i].word].length * font * .6) + .25);
      });
      setLayout({ rows: wrapPassage(widths, width, font * .75), widths });
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit); observer.observe(frame); observer.observe(ruler);
    return () => observer.disconnect();
  }, [targets]);
  const visible = passageWindow(layout.rows, current, lines);
  return <div ref={surface} className="practice-surface" data-repetitions={repetitions > 1 || repeatOnError} data-groups={groupSize > 1} data-unfocused={unfocused} onPointerDown={event => {
    if (event.button !== 0) return;
    event.preventDefault(); inputRef.current?.focus();
    if (!unfocused) { inputRef.current?.setSelectionRange(input.length, input.length); setCaret(input.length); }
  }}>
    <div ref={measure} className="passage-measure" aria-hidden="true"><MeasureWords targets={targets}/></div>
    <div className="target-words" aria-label="Practice passage" aria-description={groupSize > 1 && cursorProjection ? `Current group: ${targets.slice(cursorProjection.groupStart, cursorProjection.groupEnd).map(w => w.word).join(" ")}. ${cursorProjection.progress} of ${cursorProjection.required} repetitions.` : undefined} style={{ height: `calc(var(--line-height) * ${lines})` }}>
      {visible.lines.map((row, r) => <div className="practice-line" key={row.start} data-line={visible.start + r} data-active={visible.start + r === visible.active || undefined}>
        {targets.slice(row.start, row.end).map((target, n) => {
          const i = row.start + n;
          return <Fragment key={i}><Word word={target.word} view={projection?.cells[i]} repetitions={cursorProjection?.required || repetitions} showDots={(cursorProjection?.required || repetitions) > 1 || Boolean(cursorProjection?.recovering)} recovering={cursorProjection?.recovering} dotError={i === current && cursorProjection?.dotError} progress={i === current ? cursorProjection?.progress || 0 : 0} group={groupSize > 1 && cursorProjection && i >= cursorProjection.groupStart && i < cursorProjection.groupEnd ? { first: i === cursorProjection.groupStart, last: i === cursorProjection.groupEnd - 1, wrong: cursorProjection.groupWrong } : undefined} segmentEnd={i === Math.min(row.end, cursorProjection?.groupEnd || row.end) - 1} width={layout.widths[i]} typed={tokens[i]} complete={i < completed} active={i === current} offset={i === current ? offset : 0}/>{' '}</Fragment>;
        })}
      </div>)}
    </div>
    <button type="button" className="practice-focus" aria-label="Focus test" aria-hidden={!unfocused} tabIndex={unfocused ? 0 : -1} onClick={restoreFocus}><Icon name="focus" size={18}/><span>Click or press any key to focus</span></button>
    <label className="sr-only" htmlFor="practice-capture">Practice input</label>
    <span className="sr-only" id="practice-help">{groupSize > 1 && `Practice groups of ${groupSize} words. The underline marks the current group; dots count complete correct passes. `}{rawInput ? 'Type steno outlines, separated by spaces. Use / between strokes.' : 'Type the displayed words.'} Backspace corrects your input. Enter restarts the test. Escape opens settings.{questionHints && (rawInput ? ' Question mark toggles hints.' : ' Question mark toggles hints (H-F in Plover).')}</span>
    <textarea id="practice-capture" ref={inputRef} className="practice-capture" aria-describedby="practice-help" autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} value={input} onFocus={syncFocus} onBlur={() => setFocused(false)} onSelect={e => setCaret(e.currentTarget.selectionStart)} onChange={e => { setCaret(e.target.selectionStart); onInput(e.target.value); }}/>
  </div>;
}
