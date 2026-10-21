import { Fragment, memo, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PracticeWord } from '../domain/types';
import { passageWindow, wrapPassage } from '../domain/passage';
import type { PassageLine } from '../domain/passage';
import { hintTargetIndex } from '../domain/practice';

const MeasureWords = memo(function MeasureWords({ targets }: { targets: PracticeWord[] }) {
  // Match the displayed letter spans exactly: fractional glyph rounding can
  // differ between one text node and a series of letter spans at small sizes.
  return <>{targets.map((target, i) => <span key={i}>{[...target.word].map((letter, n) => <span key={n}>{letter}</span>)}</span>)}</>;
});

const Word = memo(function Word({ word, typed = '', complete, active, offset, width }: {
  word: string; typed?: string; complete: boolean; active: boolean; offset: number;
  width?: number;
}) {
  const cell = useRef<HTMLSpanElement>(null);
  const annotation = useRef<HTMLSpanElement>(null);
  const wrong = Boolean(typed) && (complete ? word.toLowerCase() !== typed.toLowerCase() : !word.toLowerCase().startsWith(typed.toLowerCase()));
  const letters = [...word];
  useLayoutEffect(() => {
    if (!wrong || !cell.current || !annotation.current) return;
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
  }, [wrong, typed]);
  return <span ref={cell} style={{ width }} title={word} className={`practice-word${wrong ? ' wrong' : complete ? ' correct' : ''}`}>
    {wrong && <span className="word-mistake" ref={annotation} title={typed} aria-hidden="true">{typed}</span>}
    <span className="expected-word">{letters.map((letter, i) => <span key={i} className={`${active && i === offset ? 'cursor-before ' : ''}${active && i < offset && !wrong ? 'typed-letter' : ''}`}>{letter}</span>)}{active && offset >= letters.length && <span className="cursor-end"/>}</span>
  </span>;
});

export function PracticeSurface({ targets, input, tokens, completed, onInput, inputRef, lines = 3, onHintChange }: {
  targets: PracticeWord[]; input: string; tokens: string[]; completed: number;
  onInput: (value: string) => void; inputRef: RefObject<HTMLTextAreaElement | null>; lines?: number;
  onHintChange?: (index: number) => void;
}) {
  const [caret, setCaret] = useState(0);
  const surface = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ rows: PassageLine[]; widths: number[] }>({ rows: [], widths: [] });
  const prefix = input.slice(0, Math.min(caret, input.length)).trimStart().split(/\s+/);
  const current = Math.min(targets.length - 1, Math.max(0, prefix.length - 1));
  const offset = Math.min([...(prefix.at(-1) || '')].length, [...(targets[current]?.word || '')].length);
  const hintIndex = hintTargetIndex(targets, tokens, current, offset);
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
  return <div ref={surface} className="practice-surface" onPointerDown={event => {
    if (event.button !== 0) return;
    event.preventDefault(); inputRef.current?.focus();
    inputRef.current?.setSelectionRange(input.length, input.length); setCaret(input.length);
  }}>
    <div ref={measure} className="passage-measure" aria-hidden="true"><MeasureWords targets={targets}/></div>
    <div className="target-words" aria-label="Practice passage" style={{ height: `calc(var(--line-height) * ${lines})` }}>
      {visible.lines.map((row, r) => <div className="practice-line" key={row.start} data-line={visible.start + r} data-active={visible.start + r === visible.active || undefined}>
        {targets.slice(row.start, row.end).map((target, n) => {
          const i = row.start + n;
          return <Fragment key={i}><Word word={target.word} width={layout.widths[i]} typed={tokens[i]} complete={i < completed} active={i === current} offset={i === current ? offset : 0}/>{' '}</Fragment>;
        })}
      </div>)}
    </div>
    <label className="sr-only" htmlFor="practice-capture">Practice input</label>
    <span className="sr-only" id="practice-help">Type the displayed words. Backspace corrects your input. Enter restarts the test. Escape opens settings.</span>
    <textarea id="practice-capture" ref={inputRef} className="practice-capture" aria-describedby="practice-help" autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} value={input} onSelect={e => setCaret(e.currentTarget.selectionStart)} onChange={e => { setCaret(e.target.selectionStart); onInput(e.target.value); }}/>
  </div>;
}
