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
