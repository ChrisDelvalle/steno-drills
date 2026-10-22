import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { makeEntry } from './domain/classifier';
import { defaultProfile, exportBackup, profileKey } from './domain/profile';
import type { Dictionary } from './domain/types';
import { decodeSharedTest, encodeSharedTest, normalizeSharedTest, sharedHash } from './domain/sharing';
import { concepts, conceptBanks } from './domain/concepts';

const dictionary: Dictionary = { version: 1, words: [makeEntry('bad', ['PWAD'], [['B','AE1','D']], 1), makeEntry('dim', ['TKEUPL'], [['D','IH1','M']], 2)], report: { entries: 2, words: 2, monosyllables: 2, classified: 2, starter: 2, starterCommon: 2, missingPronunciation: 0, unexplained: 0 } };
beforeEach(() => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, clear: () => memory.clear() };
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  window.location.hash = '/practice';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => dictionary }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const navigate = async (route: string) => {
  act(() => { window.location.hash = route; window.dispatchEvent(new HashChangeEvent('hashchange')); });
};
it('persists learned skills and saved word lists through the full app', async () => {
  render(<App/>);
  await screen.findByRole('button', { name: 'Test settings' });
  await navigate('/skills');
  fireEvent.click(screen.getByRole('checkbox', { name: 'initial D (TK)' }));
  expect(JSON.parse(localStorage.getItem(profileKey)!).learned).not.toContain('initial.d');
  await navigate('/exercises');
  fireEvent.click(screen.getByRole('button', { name: 'Lists' }));
  fireEvent.change(screen.getByLabelText('List name'), { target: { value: 'A to Z' } });
  fireEvent.change(screen.getByLabelText(/^Words/), { target: { value: 'bad dim bad' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save word list' }));
  expect(screen.getByText('A to Z', { exact: true })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(profileKey)!).lists[0].words).toEqual(['bad', 'dim']);
});
it('does not silently replace unreadable stored data after edits', async () => {
  localStorage.setItem(profileKey, '{damaged'); render(<App/>);
  await screen.findByRole('button', { name: 'Test settings' });
  await navigate('/skills'); fireEvent.click(screen.getByRole('checkbox', { name: 'initial D (TK)' }));
  expect(localStorage.getItem(profileKey)).toBe('{damaged');
});
it('validates a backup and waits for explicit replacement', async () => {
  render(<App/>); await screen.findByRole('button', { name: 'Test settings' });
  await navigate('/settings');
  const backup = defaultProfile(); backup.learned = [];
  const file = new File([exportBackup(backup)], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => exportBackup(backup) });
  fireEvent.change(screen.getByLabelText('Import backup'), { target: { files: [file] } });
  await screen.findByRole('region', { name: 'Backup preview' });
  expect(JSON.parse(localStorage.getItem(profileKey)!).learned.length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Replace current profile' }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(profileKey)!).learned).toEqual([]));
});
it('lets practice use custom concepts without editing learned skills', async () => {
  render(<App/>); await screen.findByRole('button', { name: 'Test settings' });
  fireEvent.click(screen.getByRole('button', { name: 'Test settings' }));
  await screen.findByRole('dialog', { name: 'Test settings' });
  const learned = JSON.parse(localStorage.getItem(profileKey)!).learned;
  fireEvent.change(screen.getByRole('combobox', { name: 'Concepts' }), { target: { value: 'custom' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'initial D (TK)' }));
  expect(JSON.parse(localStorage.getItem(profileKey)!).learned).toEqual(learned);
  expect(screen.getByText('1 word', { selector: 'div' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Practice passage')).not.toHaveTextContent('dim');
  expect(screen.getByLabelText('Practice passage')).toHaveTextContent('bad');
  fireEvent.click(screen.getByRole('button', { name: 'Hints' }));
  expect(JSON.parse(localStorage.getItem(profileKey)!).session.hints).toBe(true);
});
it('chooses restored lessons from the exercise library', async () => {
  render(<App/>); await screen.findByRole('button', { name: 'Test settings' });
  await navigate('/exercises');
  fireEvent.click(screen.getByRole('button', { name: 'Choose Short / long A' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Exercise' })).toHaveValue('drills'));
  expect(screen.getByRole('combobox', { name: 'Drill' })).toHaveValue('shortAndLongA');
  expect(screen.queryByText('Timer starts on first input.')).not.toBeInTheDocument();
});

it('opens on a ready test and restores exercise parameters after reload', async () => {
  const app = render(<App/>);
  await screen.findByRole('textbox', { name: 'Practice input' });
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Test settings' }));
  await screen.findByRole('dialog');
  fireEvent.change(screen.getByRole('combobox', { name: 'Exercise' }), { target: { value: 'fingers' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Section' }), { target: { value: '3' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Repeats' }), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  app.unmount(); render(<App/>);
  await screen.findByRole('textbox', { name: 'Practice input' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Test settings' }));
  await screen.findByRole('dialog');
  expect(screen.getByRole('combobox', { name: 'Exercise' })).toHaveValue('fingers');
  expect(screen.getByRole('combobox', { name: 'Section' })).toHaveValue('3');
  expect(screen.getByRole('combobox', { name: 'Repeats' })).toHaveValue('10');
});

it('enables question-mark hints for word practice and preserves punctuation in custom text', async () => {
  render(<App/>);
  const input = await screen.findByRole('textbox', { name: 'Practice input' });
  fireEvent.change(input, { target: { value: '?' } });
  expect(screen.getByRole('group', { name: 'Hints' })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(profileKey)!).session.hints).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Test settings' }));
  await screen.findByRole('dialog');
  fireEvent.change(screen.getByRole('combobox', { name: 'Exercise' }), { target: { value: 'text' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'why? yes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.change(screen.getByRole('textbox', { name: 'Practice input' }), { target: { value: 'why?' } });
  expect(screen.getByRole('button', { name: 'Hints' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByRole('textbox', { name: 'Practice input' }), { target: { value: 'why? yes' } });
  expect(screen.getByRole('region', { name: 'Practice results' })).toHaveTextContent('100%');
});

const teacherToken = () => {
  const result = normalizeSharedTest(defaultProfile());
  if (!result.ok) throw new Error(result.error);
  return encodeSharedTest(result.value);
};
it('opens a fresh shared test immediately without saving its concepts', async () => {
  const teacher = defaultProfile(); teacher.learned = teacher.learned.filter(id => id !== 'initial.d');
  const result = normalizeSharedTest(teacher); if (!result.ok) throw new Error(result.error);
  window.location.hash = sharedHash('practice', encodeSharedTest(result.value));
  render(<App/>); await screen.findByRole('textbox', { name: 'Practice input' });
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Practice input' })));
  expect(screen.getByLabelText('Practice passage')).toHaveTextContent('bad');
  expect(screen.getByLabelText('Practice passage')).not.toHaveTextContent('dim');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(profileKey)!).learned).toEqual(defaultProfile().learned);
});
it('uses bundled words while preserving personal skills, corrections, exclusions, and visuals', async () => {
  const personal = defaultProfile(); personal.learned = []; personal.theme = 'light'; personal.session.lines = 5; personal.session.hintPosition = 'below';
  personal.session.mode = 'count'; personal.session.count = 100; personal.excluded = ['bad'];
  personal.corrections = [{ word: 'bad', outlines: ['PWAD'], syllables: 2, pronunciation: '' }];
  localStorage.setItem(profileKey, JSON.stringify(personal)); window.location.hash = sharedHash('practice', teacherToken());
  render(<App/>); await screen.findByRole('textbox', { name: 'Practice input' });
  expect(screen.getByLabelText('Practice passage')).toHaveTextContent('bad');
  expect(screen.getByLabelText('Practice passage')).toHaveTextContent('dim');
  expect(screen.getByLabelText('Practice passage')).toHaveStyle({ height: 'calc(var(--line-height) * 5)' });
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(screen.getByLabelText('Time left')).toHaveTextContent('60');
  expect(JSON.parse(localStorage.getItem(profileKey)!)).toEqual(personal);
});
it('edits and reloads shared parameters without adding history entries or saving defaults', async () => {
  const token = teacherToken(), app = render(<App/>);
  await screen.findByRole('button', { name: 'Test settings' });
  await navigate(sharedHash('test-settings', token));
  await screen.findByText('Shared test', { exact: true });
  const personal = JSON.parse(localStorage.getItem(profileKey)!), entries = history.length;
  fireEvent.change(screen.getByRole('combobox', { name: 'Duration' }), { target: { value: '90' } });
  await waitFor(() => expect(window.location.hash).not.toContain(token));
  const changedToken = new URLSearchParams(window.location.hash.split('?')[1]).get('t')!;
  expect(decodeSharedTest(changedToken)).toMatchObject({ ok: true, value: { session: { duration: 90 } } });
  expect(history.length).toBe(entries);
  expect(JSON.parse(localStorage.getItem(profileKey)!)).toEqual(personal);
  app.unmount(); render(<App/>);
  await screen.findByRole('combobox', { name: 'Duration' });
  expect(screen.getByRole('combobox', { name: 'Duration' })).toHaveValue('90');
  expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('href', sharedHash('skills', changedToken));
  await navigate(sharedHash('skills', changedToken));
  await screen.findByRole('checkbox', { name: 'initial D (TK)' });
  expect(screen.getByRole('checkbox', { name: 'initial D (TK)' })).toBeChecked();
  await navigate(sharedHash('test-settings', changedToken));
  expect(screen.getByRole('combobox', { name: 'Duration' })).toHaveValue('90');
});
it('changes shared hints without restarting input or persisting the assistance setting', async () => {
  window.location.hash = sharedHash('practice', teacherToken()); render(<App/>);
  const input = await screen.findByRole('textbox', { name: 'Practice input' });
  fireEvent.change(input, { target: { value: 'bad ' } });
  const before = window.location.hash;
  fireEvent.click(screen.getByRole('button', { name: 'Hints' }));
  expect(input).toHaveValue('bad ');
  expect(window.location.hash).not.toBe(before);
  expect(JSON.parse(localStorage.getItem(profileKey)!).session.hints).toBe(false);
});
it('saves only shared test parameters and exits back to normal settings', async () => {
  const personal = defaultProfile(); personal.learned = []; personal.theme = 'light'; personal.excluded = ['bad'];
  personal.lists = [{ id: 'mine', name: 'Mine', words: ['dim'] }];
  localStorage.setItem(profileKey, JSON.stringify(personal));
  window.location.hash = sharedHash('test-settings', teacherToken()); render(<App/>);
  await screen.findByRole('button', { name: 'Save settings' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Duration' }), { target: { value: '90' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  const saved = JSON.parse(localStorage.getItem(profileKey)!);
  expect(saved.session.duration).toBe(90); expect(saved.learned).toEqual([]); expect(saved.theme).toBe('light');
  expect(saved.excluded).toEqual(['bad']); expect(saved.lists).toEqual(personal.lists);
  expect(saved.filter.concepts.selected).toEqual(defaultProfile().learned);
  expect(screen.queryByText('Shared test', { exact: true })).not.toBeInTheDocument();
  expect(window.location.hash).toBe('#/test-settings');
});
it('exits a shared test and restores the previous personal exercise', async () => {
  const personal = defaultProfile(); personal.practice.source = 'numbers'; personal.session.duration = 120;
  localStorage.setItem(profileKey, JSON.stringify(personal));
  window.location.hash = sharedHash('test-settings', teacherToken()); render(<App/>);
  fireEvent.click(await screen.findByRole('button', { name: 'Exit' }));
  await screen.findByRole('textbox', { name: 'Practice input' });
  expect(screen.getByLabelText('Time left')).toHaveTextContent('120');
  expect(window.location.hash).toBe('#/practice');
  expect(JSON.parse(localStorage.getItem(profileKey)!)).toEqual(personal);
});
it('copies compact links and offers a selectable URL when clipboard access fails', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal('navigator', { clipboard: { writeText } });
  window.location.hash = '/test-settings'; render(<App/>);
  fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
  await screen.findByRole('button', { name: 'Copied' });
  expect(writeText).toHaveBeenLastCalledWith(new URL('#t=' + teacherToken(), window.location.href).href);
  writeText.mockRejectedValue(new Error('denied'));
  fireEvent.click(screen.getByRole('button', { name: 'Copied' }));
  const fallback = await screen.findByRole('textbox', { name: 'Share link' });
  expect(fallback).toHaveAttribute('readonly'); expect(document.activeElement).toBe(fallback);
});
it('rejects invalid links visibly and allows returning to personal practice', async () => {
  window.location.hash = '#t=invalid!'; render(<App/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid test link.');
  expect(screen.queryByRole('textbox', { name: 'Practice input' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open practice' }));
  await screen.findByRole('textbox', { name: 'Practice input' });
  expect(window.location.hash).toBe('#/practice');
});
it('can edit a shared single-drill mix and change finger books with a high active pattern', async () => {
  window.location.hash = sharedHash('test-settings', teacherToken()); render(<App/>);
  await screen.findByRole('combobox', { name: 'Exercise' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Exercise' }), { target: { value: 'drills' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Drill' }), { target: { value: 'custom' } });
  expect(screen.getByRole('combobox', { name: 'Drill' })).toHaveValue('custom');
  fireEvent.click(screen.getByLabelText('Short / long A'));
  expect(screen.getByRole('combobox', { name: 'Drill' })).toHaveValue('custom');
  fireEvent.change(screen.getByRole('combobox', { name: 'Exercise' }), { target: { value: 'fingers' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Pattern set' }), { target: { value: 'technique' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Pattern' }), { target: { value: '25' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Pattern set' }), { target: { value: 'duo' } });
  expect(screen.getByRole('combobox', { name: 'Pattern set' })).toHaveValue('duo');
  expect(screen.getByRole('combobox', { name: 'Pattern' })).toHaveValue('0');
  fireEvent.change(screen.getByRole('combobox', { name: 'Section' }), { target: { value: '2' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Pattern' }), { target: { value: '23' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Section' }), { target: { value: '0' } });
  expect(screen.getByRole('combobox', { name: 'Section' })).toHaveValue('0');
  expect(screen.getByRole('combobox', { name: 'Pattern' })).toHaveValue('0');
});

it('isolates and round-trips v2 word options through shared editing, reload, save, and exit', async () => {
  const teacher = defaultProfile(); teacher.session = { ...teacher.session, inputMode: 'steno', repetitions: 3, requireCorrect: true };
  const normalized = normalizeSharedTest(teacher); if (!normalized.ok) throw new Error(normalized.error);
  const token = encodeSharedTest(normalized.value);
  const personal = defaultProfile(); personal.theme = 'light'; personal.learned = []; personal.session.hintTextSize = 'small';
  localStorage.setItem(profileKey, JSON.stringify(personal));
  window.location.hash = sharedHash('test-settings', token);
  const app = render(<App/>);
  expect(await screen.findByRole('checkbox', { name: 'Raw steno input' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Require correct' })).toBeChecked();
  fireEvent.change(screen.getByRole('combobox', { name: 'Repetitions' }), { target: { value: '10' } });
  const updated = window.location.hash;
  expect(updated).not.toBe(sharedHash('test-settings', token));
  expect(JSON.parse(localStorage.getItem(profileKey)!)).toEqual(personal);
  app.unmount(); render(<App/>);
  expect(await screen.findByRole('combobox', { name: 'Repetitions' })).toHaveValue('10');
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(JSON.parse(localStorage.getItem(profileKey)!).session).toMatchObject({ inputMode: 'steno', repetitions: 10, requireCorrect: true, hintTextSize: 'small' });
  expect(JSON.parse(localStorage.getItem(profileKey)!).learned).toEqual([]);
  await navigate(sharedHash('test-settings', token));
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Test settings' }));
  expect(await screen.findByRole('combobox', { name: 'Repetitions' })).toHaveValue('10');
});
it('translates raw outlines using the effective dictionary and keeps native hint punctuation editable', async () => {
  const p = defaultProfile(); p.session = { ...p.session, inputMode: 'steno', repetitions: 2, hints: true };
  p.corrections = [{ word: 'bad', outlines: ['PWA*D'], syllables: 1, pronunciation: 'B AE1 D' }];
  p.lists = [{ id: 'raw', name: 'Raw', words: ['bad'] }]; p.practice.source = 'list:raw'; p.practice.restricted = false;
  localStorage.setItem(profileKey, JSON.stringify(p)); render(<App/>);
  const input = await screen.findByRole('textbox', { name: 'Practice input' });
  // Corrected outline replaces the bundled mapping in personal practice.
  const word = document.querySelector('.session-hint strong')!.textContent!;
  const outline = word === 'bad' ? 'PWA*D' : 'TKEUPL';
  fireEvent.change(input, { target: { value: outline + '?' } });
  expect(input).toHaveValue(outline + '?');
  expect(screen.getByRole('status', { name: '1 of 2 repetitions' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Hints' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Practice passage').querySelector('.word-mistake')).not.toBeInTheDocument();
});
it('hides word-only options for other exercise types without losing saved word preferences', async () => {
  window.location.hash = '/test-settings'; render(<App/>);
  fireEvent.change(await screen.findByRole('combobox', { name: 'Repetitions' }), { target: { value: '4' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Exercise' }), { target: { value: 'numbers' } });
  expect(screen.queryByRole('checkbox', { name: 'Raw steno input' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Repetitions' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Exercise' }), { target: { value: 'bank' } });
  expect(screen.getByRole('combobox', { name: 'Repetitions' })).toHaveValue('4');
});
it('keeps unresolved list membership while excluding impossible raw targets', async () => {
  const p = defaultProfile(); p.lists = [{ id: 'unknown', name: 'Unknown', words: ['zzzzzzzzzz'] }];
  p.practice.source = 'list:unknown'; p.practice.restricted = false;
  p.session.inputMode = 'steno'; p.session.requireCorrect = true;
  localStorage.setItem(profileKey, JSON.stringify(p)); render(<App/>);
  expect(await screen.findByText('No matching words.')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Test settings' })[0]);
  expect(await screen.findByText(/1 unavailable in raw mode/)).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(profileKey)!).lists).toEqual(p.lists);
});
it('keeps recovery settings isolated in shared links through reload, save, and exercise changes', async () => {
  const personal = defaultProfile(); personal.learned = []; personal.theme = 'light';
  localStorage.setItem(profileKey, JSON.stringify(personal));
  window.location.hash = '#/test-settings?t=YCCAG';
  const app = render(<App/>);
  expect(await screen.findByRole('checkbox', { name: 'Repeat on error' })).toBeChecked();
  expect(screen.getByRole('combobox', { name: 'Error repetitions' })).toHaveValue('3');
  fireEvent.change(screen.getByRole('combobox', { name: 'Error repetitions' }), { target: { value: '5' } });
  const sharedHash = window.location.hash;
  expect(JSON.parse(localStorage.getItem(profileKey)!)).toEqual(personal);
  app.unmount(); render(<App/>);
  expect(await screen.findByRole('combobox', { name: 'Error repetitions' })).toHaveValue('5');
  expect(window.location.hash).toBe(sharedHash);
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(JSON.parse(localStorage.getItem(profileKey)!).session).toMatchObject({ repeatOnError: true, errorRepetitions: 5 });
  expect(JSON.parse(localStorage.getItem(profileKey)!).learned).toEqual([]);
  fireEvent.change(screen.getByRole('combobox', { name: 'Exercise' }), { target: { value: 'numbers' } });
  expect(screen.queryByRole('checkbox', { name: 'Repeat on error' })).not.toBeInTheDocument();
});

it('selects and clears each Skills group without changing other groups, and persists the result', async () => {
  window.location.hash = '#/skills';
  const app = render(<App/>);
  await screen.findByRole('group', { name: 'Initial sounds' });
  for (const [bank, title] of [['initial', 'Initial sounds'], ['vowel', 'Vowels'], ['final', 'Final sounds'], ['special', 'Special rules'], ['brief', 'Briefs']]) {
    const group = within(screen.getByRole('group', { name: title }));
    const ids = concepts.filter(c => c.bank === bank).map(c => c.id);
    const otherSkills = JSON.parse(localStorage.getItem(profileKey)!).learned.filter((id: string) => !ids.includes(id));
    fireEvent.click(group.getByRole('button', { name: 'Select all' }));
    expect(group.getAllByRole('checkbox').every(box => (box as HTMLInputElement).checked)).toBe(true);
    expect(group.getByRole('button', { name: 'Select all' })).toBeDisabled();
    expect(new Set(JSON.parse(localStorage.getItem(profileKey)!).learned)).toEqual(new Set([...otherSkills, ...ids]));
    fireEvent.click(group.getByRole('button', { name: 'Clear' }));
    expect(group.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
    expect(group.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(JSON.parse(localStorage.getItem(profileKey)!).learned).toEqual(otherSkills);
  }
  app.unmount(); render(<App/>);
  await screen.findByRole('group', { name: 'Initial sounds' });
  expect(screen.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
});

it('applies per-group custom concept actions to the shared test without altering personal Skills', async () => {
  const personal = defaultProfile();
  localStorage.setItem(profileKey, JSON.stringify(personal));
  window.location.hash = sharedHash('test-settings', teacherToken());
  render(<App/>);
  fireEvent.change(await screen.findByRole('combobox', { name: 'Concepts' }), { target: { value: 'custom' } });
  for (const [bank, label] of conceptBanks) {
    const group = within(screen.getByRole('group', { name: label }));
    const selectedIds = () => {
      const result = decodeSharedTest(new URLSearchParams(window.location.hash.split('?')[1]).get('t')!);
      if (!result.ok || result.value.source !== 'bank') throw new Error('Expected shared word test');
      return result.value.filter.concepts;
    };
    const ids = concepts.filter(c => c.bank === bank).map(c => c.id);
    const others = selectedIds().filter(id => !ids.includes(id));
    fireEvent.click(group.getByRole('button', { name: 'Select all' }));
    expect(new Set(selectedIds())).toEqual(new Set([...others, ...ids]));
    fireEvent.click(group.getByRole('button', { name: 'Clear' }));
    expect(new Set(selectedIds())).toEqual(new Set(others));
    expect(JSON.parse(localStorage.getItem(profileKey)!)).toEqual(personal);
  }
});

it('isolates, reloads, and saves shared group settings without changing learned Skills', async () => {
  const personal = defaultProfile(); personal.session.groupSize = 7;
  localStorage.setItem(profileKey, JSON.stringify(personal));
  window.location.hash = '#/test-settings?t=gCCBGQ';
  const app = render(<App/>);
  expect(await screen.findByRole('combobox', { name: 'Group size' })).toHaveValue('3');
  fireEvent.change(screen.getByRole('combobox', { name: 'Group size' }), { target: { value: '5' } });
  expect(JSON.parse(localStorage.getItem(profileKey)!)).toEqual(personal);
  app.unmount(); render(<App/>);
  expect(await screen.findByRole('combobox', { name: 'Group size' })).toHaveValue('5');
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(JSON.parse(localStorage.getItem(profileKey)!).session.groupSize).toBe(5);
  expect(JSON.parse(localStorage.getItem(profileKey)!).learned).toEqual(personal.learned);
});

it('isolates v5 audio settings through edits, navigation, reload, save and exit, keeping voice personal', async () => {
  const personal = defaultProfile(); personal.voice = 'saved-local'; personal.session.hints = true;
  localStorage.setItem(profileKey, JSON.stringify(personal));
  const teacher = defaultProfile(); teacher.session.listening = { enabled: true, display: 'hidden', rate: .7 };
  const result = normalizeSharedTest(teacher); if (!result.ok) throw new Error(result.error);
  const token = encodeSharedTest(result.value);
  window.location.hash = sharedHash('test-settings', token);
  let app = render(<App/>);
  await screen.findByRole('combobox', { name: 'Speed' });
  expect(screen.getByRole('combobox', { name: 'Speed' })).toHaveValue('0.7');
  fireEvent.change(screen.getByRole('combobox', { name: 'Text display' }), { target: { value: 'current' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Speed' }), { target: { value: '1.3' } });
  await waitFor(() => expect(window.location.hash).not.toBe(sharedHash('test-settings', token)));
  const edited = window.location.hash;
  expect(JSON.parse(localStorage.getItem(profileKey)!)).toEqual(personal);
  await navigate(sharedHash('skills', edited.split('t=')[1]));
  fireEvent.click(screen.getByRole('link', { name: 'Test' }));
  await navigate(sharedHash('test-settings', edited.split('t=')[1]));
  app.unmount(); app = render(<App/>);
  expect(await screen.findByRole('combobox', { name: 'Speed' })).toHaveValue('1.3');
  expect(screen.getByRole('combobox', { name: 'Text display' })).toHaveValue('current');
  expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('saved-local');
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  expect(await screen.findByRole('textbox', { name: 'Practice input' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
  await navigate(edited); fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(profileKey)!).session.listening).toEqual({ enabled: true, display: 'current', rate: 1.3 }));
  expect(JSON.parse(localStorage.getItem(profileKey)!).voice).toBe('saved-local');
  expect(JSON.parse(localStorage.getItem(profileKey)!).learned).toEqual(personal.learned);
});
