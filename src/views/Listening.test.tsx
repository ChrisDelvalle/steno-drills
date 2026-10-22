import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PracticeSession } from './Session';
import type { SessionConfig } from '../context';
import type { SpeechAdapter, SpeechEvents } from '../domain/speech';
import { createOutlineTranslator } from '../domain/translation';

const pool = ['one', 'net', 'dad', 'bad', 'main', 'feet'].map((word, i) => ({ word, outline: ['WUPB', 'TPHET', 'TKAD', 'PWAD', 'PHAEUPB', 'TPAOET'][i] }));
const config: SessionConfig = { title: 'Words', kind: 'words', ordered: true, pool, mode: 'count', duration: 30, count: 10, hints: true, questionHints: true, unrestricted: true, listening: { enabled: true, display: 'full', rate: 1 } };
function harness(overrides: Partial<SessionConfig> = {}, voices = true) {
  vi.useFakeTimers(); vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const calls: { text: string; events: SpeechEvents }[] = [];
  const adapter: SpeechAdapter = { voices: () => voices ? [{ id: 'local', name: 'English', default: true, lang: 'en-US' }] : [], subscribe: () => () => {}, cancel: vi.fn(), speak: (text, _voice, _rate, events) => { calls.push({ text, events }); } };
  const onOptionsChange = vi.fn(), onExit = vi.fn();
  const view = render(<PracticeSession config={{ ...config, ...overrides }} onExit={onExit} onOptionsChange={onOptionsChange} speechAdapter={adapter}/>);
  const type = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Practice input' }), { target: { value } });
  const play = () => fireEvent.click(screen.getByRole('button', { name: /^(Play|Replay)$/ }));
  const start = () => act(() => calls.at(-1)!.events.start());
  return { ...view, calls, adapter, type, play, start, onOptionsChange, onExit };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('waits for activation and actual speech start, then counts listening and replay time', () => {
  const h = harness();
  act(() => vi.advanceTimersByTime(5000)); expect(h.calls).toHaveLength(0);
  h.play(); expect(h.calls[0].text).toBe('one');
  act(() => vi.advanceTimersByTime(1000)); expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0');
  h.start(); act(() => vi.advanceTimersByTime(2100));
  h.play(); h.start(); expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('2');
  act(() => vi.advanceTimersByTime(1000)); expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('3');
});
it.each(['full', 'current'] as const)('starts on visible %s typing and retains every character while the first cue is pending', display => {
  const h = harness({ listening: { enabled: true, display, rate: 1 } });
  h.type('o'); expect(screen.getByRole('textbox')).toHaveValue('o');
  expect(h.calls.map(call => call.text)).toEqual(['one']);
  h.type('one'); h.type('one net');
  expect(screen.getByRole('textbox')).toHaveValue('one net');
  expect(h.calls).toHaveLength(1); // Do not supersede the first cue before its start event.
  act(() => vi.advanceTimersByTime(1000)); expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0');
  h.start(); expect(h.calls.map(call => call.text)).toEqual(['one', 'dad']);
  h.type('one net '); expect(h.calls).toHaveLength(2);
});
it('preserves raw outlines typed immediately after a fresh restart', () => {
  const translator = createOutlineTranslator(pool.map(p => ({ word: p.word, outlines: [{ outline: p.outline, requirements: [] }], pronunciations: [], syllables: [1] })));
  const h = harness({ inputMode: 'steno', translator });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  h.type('w'); h.type('wupb');
  expect(screen.getByRole('textbox')).toHaveValue('wupb'); expect(h.calls.map(call => call.text)).toEqual(['one']);
  h.start(); expect(h.calls.at(-1)?.text).toBe('net');
  h.type('wupb '); expect(h.calls).toHaveLength(2);
});
it('starts Hidden with Space, consumes that space, and immediately accepts typing', () => {
  const h = harness({ listening: { enabled: true, display: 'hidden', rate: 1 } });
  const input = screen.getByRole('textbox');
  expect(screen.getByText('Press space to start')).toBeInTheDocument();
  h.type('o'); expect(input).toHaveValue(''); expect(h.calls).toHaveLength(0);
  expect(fireEvent.keyDown(input, { key: ' ' })).toBe(false);
  expect(input).toHaveValue(''); expect(h.calls.map(call => call.text)).toEqual(['one']);
  expect(screen.queryByText('Press space to start')).not.toBeInTheDocument();
  h.type('one'); expect(input).toHaveValue('one'); expect(h.calls).toHaveLength(1);
  expect(fireEvent.keyDown(input, { key: ' ' })).toBe(true); // Ordinary spaces remain separators.
  h.type('one '); h.start(); expect(h.calls.at(-1)?.text).toBe('net');
  expect(h.container.querySelector('.passage-measure')).toBeNull();
});
it('handles input-only start spaces, reveal, and normal keyboard navigation', () => {
  const h = harness({ listening: { enabled: true, display: 'hidden', rate: 1 } });
  const input = screen.getByRole('textbox');
  expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(true);
  fireEvent.keyDown(input, { key: ' ', ctrlKey: true }); expect(h.calls).toHaveLength(0);
  const settings = screen.getByRole('button', { name: 'Test settings' });
  expect(fireEvent.keyDown(settings, { key: ' ' })).toBe(true); expect(h.calls).toHaveLength(0);
  h.type('?'); expect(h.calls).toHaveLength(0); expect(screen.getByLabelText('Practice passage')).toHaveTextContent('one');
  h.type('o'); expect(input).toHaveValue('o'); expect(h.calls).toHaveLength(1);
  fireEvent.keyDown(input, { key: 'Enter' });
  h.rerender(<PracticeSession config={config} onExit={h.onExit} speechAdapter={h.adapter} suspended/>);
  h.rerender(<PracticeSession config={{ ...config, listening: { enabled: true, display: 'hidden', rate: 1 } }} onExit={h.onExit} speechAdapter={h.adapter}/>);
  const count = h.calls.length;
  h.type(' '); expect(screen.getByRole('textbox')).toHaveValue(''); expect(h.calls).toHaveLength(count + 1);
});
it('always plays on Enter and Restart, accepts immediate input, and ignores canceled start events', () => {
  const h = harness({ listening: { enabled: true, display: 'hidden', rate: 1 } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(h.calls.map(call => call.text)).toEqual(['one']);
  h.type('o'); expect(screen.getByRole('textbox')).toHaveValue('o');
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(h.calls).toHaveLength(2); h.type('one');
  act(() => h.calls[0].events.start());
  act(() => vi.advanceTimersByTime(1000)); expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0');
  expect(h.calls).toHaveLength(2);
  act(() => h.calls[1].events.start()); expect(h.calls.at(-1)?.text).toBe('net');
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  expect(h.calls.at(-1)?.text).toBe('one'); expect(screen.getByRole('textbox')).toHaveFocus();
  h.type('o'); expect(screen.getByRole('textbox')).toHaveValue('o');
});
it('starts from Space or Enter after focus recovery without requiring a pointer', () => {
  const h = harness({ listening: { enabled: true, display: 'hidden', rate: 1 } });
  act(() => screen.getByRole('textbox').blur());
  expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(false);
  expect(h.calls).toHaveLength(1); expect(screen.getByRole('textbox')).toHaveFocus();
  act(() => screen.getByRole('textbox').blur());
  fireEvent.keyDown(document.body, { key: 'Enter' });
  expect(h.calls).toHaveLength(2); expect(screen.getByRole('textbox')).toHaveFocus();
});
it('can retry startup after failure without discarding early input or getting stuck on completion', () => {
  const h = harness({ pool: [{ word: 'one' }] });
  h.type('one'); expect(screen.getByRole('textbox')).toHaveValue('one');
  act(() => h.calls[0].events.error('Playback blocked. Select Replay to try again.'));
  expect(screen.queryByRole('region', { name: 'Practice results' })).not.toBeInTheDocument();
  h.play(); expect(h.calls.at(-1)?.text).toBe('one');
  h.start(); expect(screen.getByRole('region', { name: 'Practice results' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('region', { name: 'Practice results' }), { key: 'Enter' });
  expect(h.calls.at(-1)?.text).toBe('one'); expect(screen.getByRole('textbox')).toHaveFocus();
});
it('speaks complete groups once per pass, previews tails, and reverses edits without duplicate errors', () => {
  const h = harness({ groupSize: 3, repetitions: 2, repeatOnError: true, errorRepetitions: 3 }); h.play(); h.start();
  h.type('one net'); expect(h.calls.map(c => c.text)).toEqual(['one net dad']);
  h.type('one net dad'); expect(h.calls).toHaveLength(2);
  h.type('one net dad '); expect(h.calls).toHaveLength(2);
  h.type('one net da'); expect(h.calls).toHaveLength(3);
  h.type('one nope '); expect(h.calls).toHaveLength(3); // A midgroup error does not interrupt.
  h.type('one nope dad '); expect(h.calls).toHaveLength(4);
  h.type('one nope dad one net dad'); expect(h.calls).toHaveLength(5);
  h.type('one nope dad one net dad '); expect(h.calls).toHaveLength(5);
});
it('keeps Hidden free of expected text, outlines, titles and measurements until reveal', () => {
  const h = harness({ listening: { enabled: true, display: 'hidden', rate: 1 }, groupSize: 3, repetitions: 10 });
  const passage = screen.getByLabelText('Practice passage');
  expect(passage).not.toHaveTextContent('one');
  expect(h.container.querySelector('.passage-measure')).toBeNull();
  expect(h.container.querySelector('[title="one"]')).toBeNull();
  expect(h.container).not.toHaveTextContent('WUPB');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('status', { name: '0 of 10 repetitions' })).toBeInTheDocument();
  h.play(); h.start(); h.type('one wrong ');
  expect(passage).toHaveTextContent('one wrong'); expect(passage).not.toHaveTextContent('dad');
  expect(passage.querySelector('.listening-entered')).toHaveClass('wrong');
  fireEvent.click(screen.getByRole('button', { name: 'Hints' }));
  expect(passage).toHaveTextContent('dad'); expect(screen.getByRole('group', { name: 'Hints' })).toBeInTheDocument();
  expect(h.onOptionsChange).not.toHaveBeenCalled();
  h.type('one net dad');
  expect(passage).not.toHaveTextContent('dad'); expect(screen.queryByRole('group', { name: 'Hints' })).not.toBeInTheDocument();
  expect(h.container.querySelector('.passage-measure')).toBeNull();
  h.type('one net da'); expect(passage).toHaveTextContent('one net da');
  expect(h.container.querySelector('.passage-measure')).toBeNull();
});
it('shows only the logical current group and restores prior input on tail backspace', () => {
  const h = harness({ listening: { enabled: true, display: 'current', rate: 1 }, groupSize: 3 }); h.play(); h.start();
  const passage = screen.getByLabelText('Practice passage');
  expect(passage).toHaveTextContent('one'); expect(passage).not.toHaveTextContent('main');
  h.type('one net dad'); expect(passage).toHaveTextContent('main'); expect(passage).not.toHaveTextContent('one');
  h.type('one net dad '); expect(h.calls).toHaveLength(2);
  h.type('one net da'); expect(passage).toHaveTextContent('one'); expect(passage).not.toHaveTextContent('main');
  expect(passage.querySelector('.practice-word')).toHaveClass('correct');
  expect(passage.querySelector('.typed-letter')).toHaveTextContent('d');
});
it('handles raw tails and strict corrections, and finishes without trailing space', () => {
  const translator = createOutlineTranslator(pool.map(p => ({ word: p.word, outlines: [{ outline: p.outline, requirements: [] }], pronunciations: [], syllables: [1] })));
  const h = harness({ inputMode: 'steno', translator, requireCorrect: true }); h.play(); h.start();
  h.type('PWAD TPHET '); expect(h.calls).toHaveLength(1);
  h.type('wupb'); expect(h.calls.at(-1)?.text).toBe('net');
  h.type('wupb '); expect(h.calls).toHaveLength(2);
  h.type('wupb tphet tkad pwad phaeupb tpaoet');
  expect(screen.getByRole('region', { name: 'Practice results' })).toBeInTheDocument();
  expect(h.calls).toHaveLength(2); // A multiword update skips stale intermediate prompts.
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  expect(h.calls.at(-1)?.text).toBe('one'); expect(screen.getByRole('textbox')).toHaveValue('');
});
it('cancels on blur, hidden tab, settings, completion and unmount without restarting the clock', () => {
  const h = harness({ mode: 'timed' }); h.play(); h.start();
  fireEvent(window, new Event('blur')); const count = h.calls.length;
  act(() => h.calls[0].events.error('stale')); expect(screen.queryByText('stale')).not.toBeInTheDocument();
  fireEvent(window, new Event('focus')); expect(h.calls).toHaveLength(count);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  act(() => vi.advanceTimersByTime(30_100));
  expect(screen.getByRole('region', { name: 'Practice results' })).toBeInTheDocument();
  expect(h.adapter.cancel).toHaveBeenCalled(); h.unmount();
});
it('keeps answers concealed on missing voice or playback failure and leaves Replay available', () => {
  const h = harness({ listening: { enabled: true, display: 'hidden', rate: 1 } }, false); h.play();
  expect(screen.getByText(/No local English voice/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Replay' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Test settings' })).toBeInTheDocument();
  expect(screen.getByLabelText('Practice passage')).not.toHaveTextContent('one');
  expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0');
});

it('keeps homophones exact and resets reveal on the next prompt without saving hint preferences', () => {
  const h = harness({ pool: [{ word: 'their' }, { word: 'feet' }], listening: { enabled: true, display: 'hidden', rate: 1 }, requireCorrect: true, hints: false });
  h.play(); h.start(); h.type('there ');
  expect(h.calls).toHaveLength(1); expect(screen.getByLabelText('Practice passage')).toHaveTextContent('there');
  h.type('there ?'); expect(screen.getByLabelText('Practice passage')).toHaveTextContent('their');
  expect(h.onOptionsChange).not.toHaveBeenCalled();
  h.type('their'); expect(h.calls.at(-1)?.text).toBe('feet');
  expect(screen.getByLabelText('Practice passage')).not.toHaveTextContent('feet');
  expect(screen.getByRole('button', { name: 'Hints' })).toHaveAttribute('aria-pressed', 'false');
});
it('shows an incomplete raw outline neutrally without exposing the target or its length', () => {
  const translator = createOutlineTranslator([{ word: 'main', outlines: [{ outline: 'PHAEUPB', requirements: [] }], syllables: [1], pronunciations: [] }]);
  const h = harness({ pool: [{ word: 'main' }, { word: 'main' }], translator, requireCorrect: true, inputMode: 'steno', listening: { enabled: true, display: 'hidden', rate: 1 } });
  h.play(); h.start(); h.type('PHA');
  expect(h.container.querySelector('.listening-pending')).toHaveTextContent('PHA');
  expect(screen.getByLabelText('Practice passage')).not.toHaveTextContent('main');
  h.type('ZZZ '); expect(h.container.querySelector('.listening-entered')).toHaveClass('wrong');
});
it('cancels settings and restarts playback after activation, with a fresh clock on first utterance', () => {
  const h = harness(); h.play(); h.start(); act(() => vi.advanceTimersByTime(2000));
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(h.calls).toHaveLength(2); expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0');
  act(() => vi.advanceTimersByTime(1000)); expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0');
  h.start(); act(() => vi.advanceTimersByTime(1100)); expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('1');
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' }); expect(h.onExit).toHaveBeenCalledOnce();
  const count = h.calls.length;
  h.rerender(<PracticeSession config={config} onExit={h.onExit} speechAdapter={h.adapter} suspended/>);
  act(() => h.calls.at(-1)!.events.start()); expect(h.calls).toHaveLength(count);
  h.rerender(<PracticeSession config={config} onExit={h.onExit} speechAdapter={h.adapter}/>);
  expect(h.calls).toHaveLength(count);
  h.play(); expect(h.calls).toHaveLength(count + 1);
});
