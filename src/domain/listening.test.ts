import { expect, it } from 'vitest';
import { defaultProfile, exportBackup, importBackup, validateProfile } from './profile';
import { speechRates, validateListening } from './listening';
import { projectWordPractice, wordPracticeDefaults } from './wordPractice';
import { createOutlineTranslator, textTranslator } from './translation';

const targets = ['one', 'net', 'dad', 'bad', 'main', 'feet'].map(word => ({ word }));
it('gives a whole group a stable identity through words, exact tails, and separators', () => {
  const options = { ...wordPracticeDefaults(), groupSize: 3, repetitions: 2 };
  const p = (value: string) => projectWordPractice(targets, textTranslator.translate(value), options).prompt;
  expect(p('').id).toBe(p('one net').id);
  expect(p('one net dad')).toMatchObject({ start: 0, end: 3, pass: 1, preview: true, progress: 1 });
  expect(p('one net dad').id).toBe(p('one net dad ').id);
  expect(p('one net da').id).toBe(p('').id);
  expect(p('one net dad one net dad')).toMatchObject({ start: 3, end: 6, pass: 2, progress: 0 });
  expect(p('one net dad one net dad').id).toBe(p('one net dad one net dad ').id);
  expect(p('one wrong').id).toBe(p('').id);
  expect(p('one wrong dad ')).toMatchObject({ start: 0, pass: 1, progress: 0 });
});
it('tracks recovery retries and strict blocking without speaking on an internal mistake', () => {
  const options = { ...wordPracticeDefaults(), groupSize: 3, repeatOnError: true, errorRepetitions: 3 };
  const p = (value: string, strict = false) => projectWordPractice(targets, textTranslator.translate(value), { ...options, requireCorrect: strict }).prompt;
  expect(p('one nope ')).toMatchObject({ id: '0:0', recovering: true });
  expect(p('one nope dad ')).toMatchObject({ id: '0:1', progress: 0, required: 3 });
  expect(p('one nope dad one net dad')).toMatchObject({ id: '0:2', progress: 1, required: 3 });
  expect(p('one nope dad one net dad one wrong dad ')).toMatchObject({ progress: 0 });
  expect(p('one nope dad one net dad', true)).toMatchObject({ id: '0:0' });
  expect(p('one net dad', true)).toMatchObject({ id: '3:1' });
});
it('uses translated raw outlines for logical prompt boundaries', () => {
  const translator = createOutlineTranslator(targets.map(({ word }, i) => ({ word, outlines: [{ outline: ['WUPB', 'TPHET', 'TKAD', 'PWAD', 'PHAEUPB', 'TPAOET'][i], requirements: [] }], pronunciations: [], syllables: [1] })));
  const p = (text: string) => projectWordPractice(targets, translator.translate(text), { ...wordPracticeDefaults(), inputMode: 'steno', groupSize: 3 }).prompt;
  expect(p('wupb tphet tkad')).toMatchObject({ id: '3:1', preview: true });
  expect(p('wupb tphet tkad ').id).toBe(p('wupb tphet tkad').id);
  expect(p('wupb tphet tka')).toMatchObject({ id: '0:0' });
});
it('validates listening preferences, migrates old profiles, and round-trips backups and personal voices', () => {
  const profile = defaultProfile();
  expect(profile.session.listening).toEqual({ enabled: false, display: 'full', rate: 1 });
  const old = JSON.parse(JSON.stringify(profile)); delete old.session.listening; delete old.voice;
  expect(validateProfile(old)).toMatchObject({ voice: '', session: { listening: profile.session.listening } });
  for (const rate of speechRates) for (const display of ['full', 'current', 'hidden'] as const) {
    profile.session.listening = { enabled: true, display, rate }; profile.voice = 'local-voice';
    expect(importBackup(exportBackup(profile))).toEqual(profile);
  }
  for (const rate of [0, .55, 2.1, NaN, '1']) expect(() => validateListening({ enabled: true, display: 'full', rate })).toThrow();
  for (const display of ['none', '', 1]) expect(() => validateListening({ enabled: true, display, rate: 1 })).toThrow();
  expect(() => validateListening({ enabled: 'yes', display: 'full', rate: 1 })).toThrow();
});
