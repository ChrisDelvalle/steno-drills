import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PracticeSession } from './Session';
import type { SessionConfig } from '../context';

const config: SessionConfig = { title: 'Course words', kind: 'text', pool: ['bad', 'dim', 'name'].map(word => ({ word })), mode: 'count', duration: 30, count: 10, hints: true, unrestricted: true };
afterEach(() => vi.useRealTimers());

it('handles Plover buffer replacements, completion and restart', () => {
  vi.useFakeTimers();
  render(<PracticeSession config={config} onExit={() => {}}/>);
  const input = screen.getByRole('textbox', { name: 'Practice input' });
  fireEvent.change(input, { target: { value: 'Bad dam ' } });
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('2 words submitted of 3')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'Bad dim ' } });
  fireEvent.change(input, { target: { value: 'Bad dim name' } });
  expect(screen.getByRole('region', { name: 'Practice results' })).toBeInTheDocument();
  expect(screen.getByText('100%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  expect(screen.getByRole('textbox', { name: 'Practice input' })).toHaveValue('');
  expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0');
});
it('starts a timed session on input and ends it at the deadline', () => {
  vi.useFakeTimers();
  render(<PracticeSession config={{ ...config, kind: 'words', mode: 'timed' }} onExit={() => {}}/>);
  act(() => vi.advanceTimersByTime(35_000));
  expect(screen.queryByRole('region', { name: 'Practice results' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad ' } });
  act(() => vi.advanceTimersByTime(30_100));
  expect(screen.getByRole('region', { name: 'Practice results' })).toBeInTheDocument();
});
it('offers missed-word practice and does not hijack navigation outside a session', () => {
  render(<PracticeSession config={config} onExit={() => {}}/>);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad dam name ' } });
  expect(screen.getByRole('button', { name: 'Practice missed words' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Practice missed words' }));
  expect(screen.queryByRole('region', { name: 'Practice results' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Practice passage')).toHaveTextContent('dim');
});
it('keeps words stationary within a line and holds later active lines in the second row', () => {
  const pool = Array.from({ length: 50 }, (_, i) => ({ word: `word${i}` }));
  render(<PracticeSession config={{ ...config, pool }} onExit={() => {}}/>);
  const passage = screen.getByLabelText('Practice passage');
  const first = passage.querySelector('.practice-word');
  const original = passage.textContent;
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'word0 word1 ' } });
  expect(passage.textContent).toBe(original);
  expect(passage.querySelector('.practice-word')).toBe(first);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: pool.slice(0, 12).map(w => w.word).join(' ') + ' ' } });
  expect(passage.children).toHaveLength(3);
  expect(passage.children[1]).toHaveAttribute('data-active', 'true');
  expect(passage.querySelector('[data-line="0"]')).not.toBeInTheDocument();
});
it('toggles the entire hint panel without restarting and remembers the preference', () => {
  const onOptionsChange = vi.fn();
  render(<PracticeSession config={{ ...config, hints: false }} onExit={() => {}} onOptionsChange={onOptionsChange}/>);
  expect(screen.queryByRole('group', { name: 'Hints' })).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Hints' }));
  expect(screen.getByRole('group', { name: 'Hints' })).toBeInTheDocument();
  expect(screen.getByRole('img')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('bad ');
  expect(onOptionsChange).toHaveBeenLastCalledWith({ hints: true });
  fireEvent.click(screen.getByRole('button', { name: 'Hints' }));
  expect(screen.queryByRole('group', { name: 'Hints' })).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(onOptionsChange).toHaveBeenLastCalledWith({ hints: false });
});
it('keeps live metrics out of the typing area and leaves mistakes inside word cells', () => {
  render(<PracticeSession config={config} onExit={() => {}}/>);
  expect(screen.queryByText(/CORRECT WPM|WORD ACCURACY/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0');
  const passage = screen.getByLabelText('Practice passage');
  const expected = passage.querySelector('.expected-word')!;
  const input = screen.getByRole('textbox', { name: 'Practice input' });
  fireEvent.change(input, { target: { value: 'averylongmistakethatmustnotchangeanywordwidth ' } });
  expect(passage.querySelector('.expected-word')).toBe(expected);
  expect(passage.querySelector('.word-mistake')).toHaveTextContent('averylongmistakethatmustnotchangeanywordwidth');
  expect(expected.parentElement).toHaveClass('wrong');
  fireEvent.change(input, { target: { value: 'bad ' } });
  expect(passage.querySelector('.word-mistake')).not.toBeInTheDocument();
  expect(expected.parentElement).toHaveClass('correct');
});

it('restarts with Enter during a test, from results, and from Plover newline input', () => {
  render(<PracticeSession config={config} onExit={() => {}}/>);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad ' } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(screen.getByRole('textbox')).toHaveValue('');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad dim name' } });
  const results = screen.getByRole('region', { name: 'Practice results' });
  fireEvent.keyDown(results, { key: 'Enter' });
  expect(screen.getByRole('textbox')).toHaveValue('');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad\n' } });
  expect(screen.getByRole('textbox')).toHaveValue('');
});
it('keeps Enter available for settings fields and ignores composition confirmation', () => {
  const exit = vi.fn();
  const app = render(<PracticeSession config={config} onExit={exit} suspended/>);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad ' } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(screen.getByRole('textbox')).toHaveValue('bad ');
  app.rerender(<PracticeSession config={config} onExit={exit}/>);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad ' } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', isComposing: true });
  expect(screen.getByRole('textbox')).toHaveValue('bad ');
});

it('shows total seconds and rounds the countdown up to avoid losing the first second', () => {
  vi.useFakeTimers();
  render(<PracticeSession config={{ ...config, kind: 'words', mode: 'timed', duration: 90 }} onExit={() => {}}/>);
  expect(screen.getByLabelText('Time left')).toHaveTextContent('90');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad ' } });
  act(() => vi.advanceTimersByTime(1100));
  expect(screen.getByLabelText('Time left')).toHaveTextContent('89');
});

it('defaults hints above the test and supports configurable rows and hint placement', () => {
  const app = render(<PracticeSession config={config} onExit={() => {}}/>);
  expect(screen.getByRole('group', { name: 'Hints' }).parentElement).toHaveClass('hint-above');
  app.rerender(<PracticeSession key="below" config={{ ...config, lines: 5, hintPosition: 'below', hintTextSize: 'extra-large', hintKeyboardSize: 'medium' }} onExit={() => {}}/>);
  expect(screen.getByRole('group', { name: 'Hints' }).parentElement).toHaveClass('hint-below');
  expect(screen.getByLabelText('Practice passage')).toHaveStyle({ height: 'calc(var(--line-height) * 5)' });
  expect(screen.getByRole('main')).toHaveAttribute('data-hint-text', 'extra-large');
  expect(screen.getByRole('main')).toHaveAttribute('data-hint-keyboard', 'medium');
});
it('keeps hints aligned with the caret when editing earlier words', () => {
  render(<PracticeSession config={config} onExit={() => {}}/>);
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: 'bad dim ' } });
  expect(screen.getByRole('group', { name: 'Hints' })).toHaveTextContent('name');
  input.focus(); input.setSelectionRange(0, 0); fireEvent.select(input);
  expect(screen.getByRole('group', { name: 'Hints' })).toHaveTextContent('bad');
});
it('advances hints on a complete Plover word without waiting for an automatic space', () => {
  const pool = [{ word: 'one', outline: 'WUPB' }, { word: 'net', outline: 'TPHET' }, { word: 'dad', outline: 'TKAD' }];
  render(<PracticeSession config={{ ...config, pool }} onExit={() => {}}/>);
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  const hint = () => screen.getByRole('group', { name: 'Hints' });
  const target = screen.getByLabelText('Practice passage').querySelector('.practice-word');
  expect(hint()).toHaveTextContent('one');
  fireEvent.change(input, { target: { value: 'on' } }); expect(hint()).toHaveTextContent('one');
  fireEvent.change(input, { target: { value: 'ONE' } }); expect(hint()).toHaveTextContent('net');
  expect(hint()).toHaveTextContent('TPHET');
  expect(screen.getByLabelText('Practice passage').querySelector('.practice-word')).toBe(target);
  fireEvent.change(input, { target: { value: 'one ne' } }); expect(hint()).toHaveTextContent('net');
  fireEvent.change(input, { target: { value: 'one not' } }); expect(hint()).toHaveTextContent('net');
  fireEvent.change(input, { target: { value: 'one net' } }); expect(hint()).toHaveTextContent('dad');
  fireEvent.change(input, { target: { value: 'one ne' } }); expect(hint()).toHaveTextContent('net');
  fireEvent.change(input, { target: { value: 'one net ' } }); expect(hint()).toHaveTextContent('dad');
  input.focus(); input.setSelectionRange(1, 1); fireEvent.select(input); expect(hint()).toHaveTextContent('one');
});
it('waits for an entire multi-stroke or punctuated target rather than each input event', () => {
  const pool = [{ word: 'tablet', outline: 'TAB/HRET' }, { word: 'one,', outline: 'WUPB' }, { word: 'dad', outline: 'TKAD' }];
  render(<PracticeSession config={{ ...config, pool }} onExit={() => {}}/>);
  const input = screen.getByRole('textbox');
  const hint = () => screen.getByRole('group', { name: 'Hints' });
  fireEvent.change(input, { target: { value: 'tab' } }); expect(hint()).toHaveTextContent('tablet');
  fireEvent.change(input, { target: { value: 'tablet' } }); expect(hint()).toHaveTextContent('one,');
  fireEvent.change(input, { target: { value: 'tablet one' } }); expect(hint()).toHaveTextContent('one,');
  fireEvent.change(input, { target: { value: 'tablet one,' } }); expect(hint()).toHaveTextContent('dad');
  fireEvent.change(input, { target: { value: 'table' } }); expect(hint()).toHaveTextContent('tablet');
});

it('hides controls on input and reveals them on pointer activity without interrupting practice', () => {
  render(<PracticeSession config={config} onExit={() => {}}/>);
  const session = screen.getByRole('main');
  const input = screen.getByRole('textbox');
  const passage = screen.getByLabelText('Practice passage');
  const actions = screen.getByRole('button', { name: 'Restart' }).parentElement;
  expect(session).toHaveAttribute('data-controls-hidden', 'false');
  fireEvent.change(input, { target: { value: 'bad' } });
  expect(session).toHaveAttribute('data-controls-hidden', 'true');
  expect(screen.getByRole('link', { name: 'Steno Drills' }).closest('.session-controls')).toBeNull();
  expect(screen.getByRole('group', { name: 'Hints' }).closest('.session-controls')).toBeNull();
  expect(screen.getByLabelText('Elapsed time').closest('.session-controls')).toBeNull();
  expect(passage.closest('.session-controls')).toBeNull();
  expect(actions).toHaveClass('session-controls');
  expect(screen.getByRole('button', { name: 'Test settings' })).toHaveClass('session-controls');
  fireEvent.pointerMove(window);
  expect(session).toHaveAttribute('data-controls-hidden', 'false');
  expect(input).toHaveValue('bad');
  fireEvent.change(input, { target: { value: 'bad d' } });
  expect(session).toHaveAttribute('data-controls-hidden', 'true');
  fireEvent.pointerDown(window, { pointerType: 'touch' });
  expect(session).toHaveAttribute('data-controls-hidden', 'false');
  fireEvent.change(input, { target: { value: 'bad ' } });
  expect(session).toHaveAttribute('data-controls-hidden', 'true');
  expect(screen.getByLabelText('Practice passage')).toBe(passage);
  expect(screen.getByRole('button', { name: 'Restart' }).parentElement).toBe(actions);
});

it('reveals controls for keyboard navigation and after restart or completion', () => {
  const exit = vi.fn();
  render(<PracticeSession config={config} onExit={exit}/>);
  const session = screen.getByRole('main');
  const input = screen.getByRole('textbox');
  const type = (value: string) => fireEvent.change(input, { target: { value } });
  type('bad');
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(session).toHaveAttribute('data-controls-hidden', 'false');
  type('bad d');
  act(() => screen.getByRole('button', { name: 'Test settings' }).focus());
  expect(session).toHaveAttribute('data-controls-hidden', 'false');
  type('bad dim');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(session).toHaveAttribute('data-controls-hidden', 'false');
  expect(input).toHaveValue('');
  type('bad dim name');
  expect(screen.getByRole('region', { name: 'Practice results' })).toBeInTheDocument();
  expect(session).toHaveAttribute('data-controls-hidden', 'false');
  fireEvent.keyDown(session, { key: 'Escape' });
  expect(exit).toHaveBeenCalledOnce();
});

it('treats question marks as hint commands without changing Plover buffers, timing or scoring', () => {
  vi.useFakeTimers();
  const changed = vi.fn();
  render(<PracticeSession config={{ ...config, questionHints: true }} onExit={() => {}} onOptionsChange={changed}/>);
  act(() => vi.advanceTimersByTime(20));
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  const passage = screen.getByLabelText('Practice passage');
  const word = passage.querySelector('.practice-word');
  fireEvent.change(input, { target: { value: '?' } });
  expect(input).toHaveValue('?');
  expect(screen.queryByRole('group', { name: 'Hints' })).not.toBeInTheDocument();
  expect(changed).toHaveBeenLastCalledWith({ hints: false });
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0');
  fireEvent.change(input, { target: { value: '?bad' } });
  act(() => vi.advanceTimersByTime(1000));
  fireEvent.change(input, { target: { value: '?bad?' } });
  expect(screen.getByRole('group', { name: 'Hints' })).toHaveTextContent('dim');
  expect(screen.getByRole('main')).toHaveAttribute('data-controls-hidden', 'true');
  expect(passage.querySelector('.practice-word')).toBe(word);
  expect(passage.querySelector('.word-mistake')).not.toBeInTheDocument();
  expect(changed).toHaveBeenLastCalledWith({ hints: true });
  // Plover undo removes its own punctuation; it must not remove a letter or
  // toggle a second time merely because the old command remains in the buffer.
  fireEvent.change(input, { target: { value: '?bad' } });
  fireEvent.change(input, { target: { value: '?bad dam' } });
  fireEvent.change(input, { target: { value: '?bad dim' } });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(input).toHaveValue('?bad dim');
  expect(screen.getByRole('group', { name: 'Hints' })).toHaveTextContent('name');
  fireEvent.change(input, { target: { value: '?bad dim name' } });
  expect(screen.getByRole('region', { name: 'Practice results' })).toHaveTextContent('100%');
  expect(screen.getByText('0 incorrect')).toBeInTheDocument();
});

it('keeps question marks literal when an exercise needs punctuation', () => {
  const changed = vi.fn();
  render(<PracticeSession config={{ ...config, pool: [{ word: 'why?' }, { word: 'yes' }] }} onExit={() => {}} onOptionsChange={changed}/>);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'why?' } });
  expect(screen.getByRole('group', { name: 'Hints' })).toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'why? yes' } });
  expect(screen.getByRole('region', { name: 'Practice results' })).toHaveTextContent('100%');
});

it('offers click and keyboard focus recovery without moving words or discarding input or selection', () => {
  vi.useFakeTimers();
  render(<PracticeSession config={config} onExit={() => {}}/>);
  act(() => vi.advanceTimersByTime(20));
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  expect(input).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Focus test' })).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'bad d' } });
  input.setSelectionRange(1, 1);
  fireEvent.select(input);
  const word = screen.getByLabelText('Practice passage').querySelector('.practice-word');
  act(() => input.blur());
  const overlay = screen.getByRole('button', { name: 'Focus test' });
  expect(overlay.parentElement).toHaveAttribute('data-unfocused', 'true');
  fireEvent.click(overlay);
  expect(input).toHaveFocus();
  expect(input).toHaveValue('bad d');
  expect(input.selectionStart).toBe(1);
  expect(screen.getByLabelText('Practice passage').querySelector('.practice-word')).toBe(word);
  act(() => screen.getByRole('button', { name: 'Test settings' }).focus());
  expect(screen.getByRole('button', { name: 'Focus test' })).toBeInTheDocument();
  expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Test settings' }), { key: 'Tab' })).toBe(true);
  act(() => (document.activeElement as HTMLElement).blur());
  fireEvent.keyDown(document.body, { key: 'b' });
  expect(input).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Focus test' })).not.toBeInTheDocument();
  fireEvent.blur(window);
  expect(screen.getByRole('button', { name: 'Focus test' })).toBeInTheDocument();
  fireEvent.focus(window);
  expect(screen.queryByRole('button', { name: 'Focus test' })).not.toBeInTheDocument();
  act(() => input.blur());
  const keyboardOverlay = screen.getByRole('button', { name: 'Focus test' });
  act(() => keyboardOverlay.focus());
  fireEvent.keyDown(keyboardOverlay, { key: 'd' });
  expect(input).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Focus test' })).not.toBeInTheDocument();
});

it('does not steal settings focus or show a recovery overlay behind the settings dialog', () => {
  vi.useFakeTimers();
  render(<><PracticeSession config={config} onExit={() => {}} suspended/><input aria-label="Settings field"/></>);
  const field = screen.getByRole('textbox', { name: 'Settings field' });
  act(() => field.focus());
  fireEvent.keyDown(field, { key: 'b' });
  act(() => vi.advanceTimersByTime(100));
  expect(field).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Focus test' })).not.toBeInTheDocument();
});

it('shows repetition dots, preserves progress through mistakes, and reverses edits', () => {
  render(<PracticeSession config={{ ...config, kind: 'words', ordered: true, repetitions: 3 }} onExit={() => {}}/>);
  const input = screen.getByRole('textbox');
  const passage = screen.getByLabelText('Practice passage');
  const first = passage.querySelector('.practice-word');
  fireEvent.change(input, { target: { value: 'bad bad' } });
  expect(screen.getByRole('status', { name: '2 of 3 repetitions' })).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'bad bad nope ' } });
  expect(screen.getByRole('status', { name: '2 of 3 repetitions' })).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'bad bad bad' } });
  expect(screen.getByRole('status', { name: '3 of 3 repetitions' })).toBeInTheDocument();
  expect(document.querySelector('.session-hint strong')).toHaveTextContent('dim');
  fireEvent.change(input, { target: { value: 'bad bad ba' } });
  expect(screen.getByRole('status', { name: '2 of 3 repetitions' })).toBeInTheDocument();
  expect(document.querySelector('.session-hint strong')).toHaveTextContent('bad');
  expect(passage.querySelector('.practice-word')).toBe(first);
  fireEvent.change(input, { target: { value: 'bad bad bad dim dim dim name name name' } });
  expect(screen.getByRole('region', { name: 'Practice results' })).toHaveTextContent('90%');
  fireEvent.keyDown(screen.getByRole('region', { name: 'Practice results' }), { key: 'Enter' });
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByRole('status', { name: '0 of 3 repetitions' })).toBeInTheDocument();
});
it('keeps strict mistakes and blocked input visible and retains error accuracy after correction', () => {
  render(<PracticeSession config={{ ...config, kind: 'words', ordered: true, requireCorrect: true }} onExit={() => {}}/>);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'wrong dim name ' } });
  expect(screen.queryByRole('region', { name: 'Practice results' })).not.toBeInTheDocument();
  expect(document.querySelector('.word-mistake')).toHaveTextContent('wrong dim name');
  fireEvent.change(input, { target: { value: 'bad dim name' } });
  expect(screen.getByRole('region', { name: 'Practice results' })).toHaveTextContent('75%');
});
it('ends repeated practice at its timed deadline without requiring a word to finish', () => {
  vi.useFakeTimers();
  render(<PracticeSession config={{ ...config, kind: 'words', mode: 'timed', repetitions: 10 }} onExit={() => {}}/>);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bad ' } });
  act(() => vi.advanceTimersByTime(30_100));
  expect(screen.getByRole('region', { name: 'Practice results' })).toBeInTheDocument();
});
