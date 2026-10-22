import { expect, it } from 'vitest';
import { defaultProfile, exportBackup, importBackup, loadProfile, profileKey, saveProfile, validateCorrection } from './profile';
import { applyCorrections, eligibleWords, parseWordList } from './vocabulary';
import { makeEntry } from './classifier';

it('round-trips lists, dynamic filters, corrections and exclusions', () => {
  const p = defaultProfile();
  p.lists.push({ id: 'personal', name: 'Course words', words: ['dim', 'bad'] });
  p.corrections.push({ word: 'dim', outlines: ['TKEUPL'], pronunciation: 'D IH1 M', syllables: 1 });
  p.excluded.push('bad'); p.filter.focus = 'initial.d';
  expect(importBackup(exportBackup(p))).toEqual(p);
});
it('rejects invalid backups atomically', () => {
  const p = defaultProfile();
  expect(() => importBackup(exportBackup({ ...p, learned: ['made-up'] }))).toThrow('Unknown concept');
  expect(() => importBackup('{')).toThrow();
  expect(() => importBackup(JSON.stringify({ app: 'other', version: 1, profile: p }))).toThrow();
});
it('retains local profiles and backups created before the app was renamed', () => {
  const profile = defaultProfile();
  const legacy = JSON.stringify(profile);
  const storage = { getItem: (key: string) => key === 'steno-jig.profile.v1' ? legacy : null, setItem: () => {} };
  expect(loadProfile(() => storage).profile).toEqual(profile);
  expect(importBackup(JSON.stringify({ app: 'steno-jig', version: 1, profile }))).toEqual(profile);
  expect(JSON.parse(exportBackup(profile)).app).toBe('steno-drills');
});
it('does not overwrite malformed or unavailable storage', () => {
  let writes = 0;
  const storage = { getItem: () => '{broken', setItem: () => { writes++; } };
  const loaded = loadProfile(() => storage);
  expect(loaded.writable).toBe(false); expect(writes).toBe(0);
  expect(loadProfile(() => { throw new Error('blocked'); }).writable).toBe(false);
  expect(saveProfile(() => { throw new Error('quota'); }, defaultProfile())).toBe(false);
  const good = { getItem: () => null, setItem: (key: string) => { expect(key).toBe(profileKey); } };
  expect(saveProfile(() => good, defaultProfile())).toBe(true);
});
it('keeps explicit list membership stable while saved filters expand with skills', () => {
  const p = defaultProfile(); p.filter.pool = 'all'; p.learned = p.learned.filter(c => c !== 'initial.d');
  p.lists = [{ id: 'list', name: 'Fixed', words: ['bad'] }];
  const words = [makeEntry('dim', ['TKEUPL'], [['D', 'IH1', 'M']])];
  expect(eligibleWords(words, p)).toHaveLength(0);
  p.learned.push('initial.d'); expect(eligibleWords(words, p)).toHaveLength(1);
  expect(p.lists[0].words).toEqual(['bad']);
});
it('applies personal metadata without mutating bundled entries', () => {
  const p = defaultProfile(); const original = makeEntry('dim', ['TKEUPL'], []);
  p.corrections = [validateCorrection({ word: 'dim', outlines: ['TKEUPL'], syllables: 1, pronunciation: 'D IH1 M' })];
  const corrected = applyCorrections([original], p);
  expect(corrected[0].syllables).toEqual([1]); expect(original.syllables).toEqual([]);
  expect(() => validateCorrection({ ...p.corrections[0], syllables: 2 })).toThrow('does not match');
  expect(parseWordList('Bad dim\nbad')).toEqual(['bad', 'dim']);
});
it('migrates old filter defaults and preserves custom selections in backups', () => {
  const profile = defaultProfile();
  delete profile.filter.concepts;
  profile.exercises[0].name = 'Everything I know';
  const migrated = importBackup(exportBackup(profile));
  expect(migrated.filter.concepts).toEqual({ mode: 'personal', selected: [] });
  expect(migrated.exercises[0].name).toBe('Skills');
  migrated.filter.concepts = { mode: 'custom', selected: ['initial.d','vowel.short-i','final.m'] };
  expect(importBackup(exportBackup(migrated))).toEqual(migrated);
});
it('changes practice concepts independently of learned skills', () => {
  const p = defaultProfile(); p.filter.pool = 'all'; const learned = [...p.learned];
  p.learned = [];
  const words = [makeEntry('dim', ['TKEUPL'], [['D','IH1','M']])];
  expect(eligibleWords(words, p)).toHaveLength(0);
  p.filter.concepts = { mode: 'starter', selected: [] };
  expect(eligibleWords(words, p)).toHaveLength(1);
  p.filter.concepts = { mode: 'custom', selected: learned.filter(id => id !== 'initial.d') };
  expect(eligibleWords(words, p)).toHaveLength(0);
  p.filter.concepts.selected.push('initial.d');
  expect(eligibleWords(words, p)).toHaveLength(1);
  expect(p.learned).toEqual([]);
});
it('round-trips practice parameters and supplies defaults for older backups', () => {
  const profile = defaultProfile();
  profile.practice = { ...profile.practice, source: 'fingers', section: 12, pattern: -1, repeats: 10, quoteLength: 'short', restricted: false };
  expect(importBackup(exportBackup(profile))).toEqual(profile);
  const old = JSON.parse(exportBackup(profile)); delete old.profile.practice;
  expect(importBackup(JSON.stringify(old)).practice.source).toBe('bank');
  expect(() => importBackup(exportBackup({ ...profile, practice: { ...profile.practice, section: 1000 } }))).toThrow();
});

it('validates, persists, and migrates line and hint display settings', () => {
  const profile = defaultProfile();
  profile.session = { ...profile.session, lines: 6, hintPosition: 'below', hintTextSize: 'extra-large', hintKeyboardSize: 'small' };
  expect(importBackup(exportBackup(profile)).session).toEqual(profile.session);
  const old = JSON.parse(exportBackup(profile));
  for (const key of ['lines', 'hintPosition', 'hintTextSize', 'hintKeyboardSize']) delete old.profile.session[key];
  expect(importBackup(JSON.stringify(old)).session).toMatchObject({ lines: 3, hintPosition: 'above', hintTextSize: 'extra-large', hintKeyboardSize: 'extra-large' });
  expect(() => importBackup(exportBackup({ ...profile, session: { ...profile.session, lines: 0 } }))).toThrow();
});
it('migrates the unsupported final-S rule out of earlier profiles', () => {
  const profile = defaultProfile(); profile.learned.push('special.final-s-f');
  profile.filter.concepts = { mode: 'custom', selected: ['initial.j','special.final-s-f'] };
  profile.filter.focus = 'special.final-s-f';
  const migrated = importBackup(exportBackup(profile));
  expect(migrated.learned).not.toContain('special.final-s-f');
  expect(migrated.filter.concepts!.selected).toEqual(['initial.j']);
  expect(migrated.filter.focus).toBe('');
});

it('round-trips word options and preserves explicit hint sizes while migrating old profiles', () => {
  const p = defaultProfile();
  p.session = { ...p.session, inputMode: 'steno', repetitions: 10, requireCorrect: true, hintTextSize: 'small', hintKeyboardSize: 'large' };
  expect(importBackup(exportBackup(p))).toEqual(p);
  const old = JSON.parse(exportBackup(p));
  for (const key of ['inputMode', 'repetitions', 'requireCorrect']) delete old.profile.session[key];
  expect(importBackup(JSON.stringify(old)).session).toMatchObject({ inputMode: 'text', repetitions: 1, requireCorrect: false, hintTextSize: 'small', hintKeyboardSize: 'large' });
  for (const repetitions of [0, 11, 2.5, '3']) expect(() => importBackup(exportBackup({ ...p, session: { ...p.session, repetitions } } as never))).toThrow();
  expect(() => importBackup(exportBackup({ ...p, session: { ...p.session, inputMode: 'other' } } as never))).toThrow();
});
it('migrates, validates, and backs up error-recovery settings', () => {
  const p = defaultProfile(); p.session.repeatOnError = true; p.session.errorRepetitions = 10;
  expect(importBackup(exportBackup(p))).toEqual(p);
  const old = JSON.parse(exportBackup(p));
  delete old.profile.session.repeatOnError; delete old.profile.session.errorRepetitions;
  expect(importBackup(JSON.stringify(old)).session).toMatchObject({ repeatOnError: false, errorRepetitions: 3 });
  for (const errorRepetitions of [0, 11, 1.5, null]) expect(() => importBackup(exportBackup({ ...p, session: { ...p.session, errorRepetitions } } as never))).toThrow();
  expect(() => importBackup(exportBackup({ ...p, session: { ...p.session, repeatOnError: 'true' } } as never))).toThrow();
});
