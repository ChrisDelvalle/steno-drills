import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { makeEntry } from './domain/classifier';
import { defaultProfile, exportBackup, profileKey } from './domain/profile';
import type { Dictionary } from './domain/types';

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
  expect(screen.getByText('1 word')).toBeInTheDocument();
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
