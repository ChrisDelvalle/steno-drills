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
  fireEvent.click(screen.getByRole('button', { name: 'Practice again' }));
  expect(screen.getByRole('textbox', { name: 'Practice input' })).toHaveValue('');
  expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:00');
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
  expect(screen.getByText('Missed words', { exact: true })).toBeInTheDocument();
  expect(screen.getByLabelText('Practice passage')).toHaveTextContent('dim');
});
