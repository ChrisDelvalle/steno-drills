import { conceptMap, starterSkills } from './concepts';
import { parseStroke, phoneSet, syllableCount } from './classifier';
import type { Filter, Profile, WordCorrection } from './types';
import { wordPracticeDefaults } from './wordPractice';
import { fingerSections, keyboardSets, wordDrills } from './exercises';

export const profileKey = 'steno-drills.profile.v1';
export const defaultFilter = (): Filter => ({ pool: 'common', focus: '', minLength: 1, maxLength: 30, concepts: { mode: 'personal', selected: [] } });
export const defaultPractice = (): Profile['practice'] => ({ source: 'bank', restricted: true, drill: 'd-/b-', mixed: ['d-/b-', 'shortAndLongA'], keyboardSet: 'selected', fingerBook: 'duo', section: 0, pattern: 0, repeats: 20, customPatterns: 'EFB/URP', quoteLength: 'medium', symbolVariants: false });
export const defaultProfile = (): Profile => ({
  version: 1, learned: [...starterSkills], lists: [], corrections: [], excluded: [],
  exercises: [{ id: 'everything', name: 'Skills', filter: defaultFilter() }],
  filter: defaultFilter(), theme: 'dark', customText: '', practice: defaultPractice(), session: { ...wordPracticeDefaults(), mode: 'timed', duration: 60, count: 25, hints: false, lines: 3, hintPosition: 'above', hintTextSize: 'extra-large', hintKeyboardSize: 'extra-large' },
});

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
};
const string = (v: unknown, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`Expected text between 1 and ${max} characters.`);
  return v;
};
const integer = (v: unknown, min: number, max: number) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Error(`Expected a whole number from ${min} to ${max}.`);
  return v;
};
const array = <T>(v: unknown, parse: (item: unknown) => T, max = 5000): T[] => {
  if (!Array.isArray(v) || v.length > max) throw new Error(`Expected a list of at most ${max} items.`);
  return v.map(parse);
};
const word = (v: unknown) => {
  const w = string(v, 100);
  if (!/^[a-z]+(?:['-][a-z]+)*$/.test(w)) throw new Error(`Invalid word: ${w}. Use lowercase words without spaces.`);
  return w;
};
const learnedConcept = (v: unknown) => {
  const id = string(v);
  if (!conceptMap.has(id)) throw new Error(`Unknown concept: ${id}.`);
  return id;
};
// The first release included this unsupported rule without dictionary evidence.
const conceptList = (v: unknown) => [...new Set(array(v, item => item === 'special.final-s-f' ? item : learnedConcept(item), 500))].filter(id => id !== 'special.final-s-f');
export function validateFilter(v: unknown): Filter {
  const f = object(v);
  if (f.pool !== 'common' && f.pool !== 'all') throw new Error('Unknown word pool.');
  const minLength = integer(f.minLength, 1, 100), maxLength = integer(f.maxLength, 1, 100);
  if (minLength > maxLength) throw new Error('Minimum word length must not exceed maximum.');
  const selection = f.concepts === undefined ? { mode: 'personal', selected: [] } : object(f.concepts);
  if (!['personal', 'single', 'starter', 'all', 'custom'].includes(String(selection.mode))) throw new Error('Unknown concept selection.');
  return { pool: f.pool, focus: f.focus === '' || f.focus === 'special.final-s-f' ? '' : learnedConcept(f.focus), minLength, maxLength,
    concepts: { mode: selection.mode as NonNullable<Filter['concepts']>['mode'], selected: conceptList(selection.selected) } };
}
export function validateCorrection(v: unknown): WordCorrection {
  const c = object(v);
  const outlines = array(c.outlines, v => {
    const o = string(v, 150);
    if (o.split('/').some(s => !parseStroke(s))) throw new Error(`Invalid machine steno: ${o}. Use steno order, not phonetic shorthand.`);
    return o;
  }, 20);
  if (!outlines.length) throw new Error('Add at least one outline.');
  if (typeof c.pronunciation !== 'string' || c.pronunciation.length > 500) throw new Error('Invalid pronunciation.');
  const pronunciation = c.pronunciation.trim().toUpperCase();
  const phones = pronunciation ? pronunciation.split(/\s+/) : [];
  if (phones.some(p => !phoneSet.has(p.replace(/[012]$/, '')))) throw new Error('Use CMU/ARPAbet phones such as B AE1 D.');
  const syllables = integer(c.syllables, 1, 20);
  if (phones.length && syllableCount(phones) !== syllables) throw new Error('The syllable count does not match the pronunciation.');
  return { word: word(c.word), outlines: [...new Set(outlines)], syllables, pronunciation };
}
export function validateProfile(v: unknown): Profile {
  const p = object(v);
  if (p.version !== 1) throw new Error('Unsupported profile version.');
  const lists = array(p.lists, v => {
    const l = object(v);
    return { id: string(l.id), name: string(l.name, 80), words: [...new Set(array(l.words, word))] };
  }, 100);
  const exercises = array(p.exercises, v => {
    const e = object(v);
    const name = e.id === 'everything' && ['Everything I know', 'My skills', 'My Skills'].includes(String(e.name)) ? 'Skills' : string(e.name, 80);
    return { id: string(e.id), name, filter: validateFilter(e.filter) };
  }, 100);
  const corrections = array(p.corrections, validateCorrection);
  for (const ids of [lists.map(l => l.id), exercises.map(e => e.id), corrections.map(c => c.word)]) {
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate list, exercise, or correction identifiers.');
  }
  if (!['system', 'light', 'dark'].includes(String(p.theme))) throw new Error('Invalid theme.');
  if (typeof p.customText !== 'string' || p.customText.length > 100_000) throw new Error('Custom text must contain at most 100,000 characters.');
  const session = object(p.session);
  if (session.mode !== 'timed' && session.mode !== 'count') throw new Error('Invalid session mode.');
  if (typeof session.hints !== 'boolean') throw new Error('Invalid hints setting.');
  const lines = session.lines === undefined ? 3 : integer(session.lines, 3, 8);
  const hintPosition = session.hintPosition === undefined ? 'above' : session.hintPosition;
  if (hintPosition !== 'above' && hintPosition !== 'below') throw new Error('Invalid hint position.');
  const hintSize = (v: unknown): Profile['session']['hintTextSize'] => {
    if (v === undefined) return 'extra-large';
    if (v !== 'small' && v !== 'medium' && v !== 'large' && v !== 'extra-large') throw new Error('Invalid hint size.');
    return v;
  };
  const hintTextSize = hintSize(session.hintTextSize), hintKeyboardSize = hintSize(session.hintKeyboardSize);
  const inputMode = session.inputMode === undefined ? 'text' : session.inputMode;
  if (inputMode !== 'text' && inputMode !== 'steno') throw new Error('Invalid input mode.');
  const repetitions = session.repetitions === undefined ? 1 : integer(session.repetitions, 1, 10);
  const requireCorrect = session.requireCorrect === undefined ? false : session.requireCorrect;
  if (typeof requireCorrect !== 'boolean') throw new Error('Invalid correction setting.');
  const repeatOnError = session.repeatOnError === undefined ? false : session.repeatOnError;
  if (typeof repeatOnError !== 'boolean') throw new Error('Invalid repeat-on-error setting.');
  const errorRepetitions = session.errorRepetitions === undefined ? 3 : integer(session.errorRepetitions, 1, 10);
  const duration = integer(session.duration, 30, 300), count = integer(session.count, 10, 500);
  if (![30, 60, 90, 120, 300].includes(duration) || ![10, 25, 50, 100, 250, 500].includes(count)) throw new Error('Unsupported practice length.');
  const practice = p.practice === undefined ? defaultPractice() : validatePractice(p.practice);
  return {
    version: 1, learned: conceptList(p.learned), lists, exercises, corrections,
    excluded: [...new Set(array(p.excluded, word))], filter: validateFilter(p.filter),
    theme: p.theme as Profile['theme'], customText: p.customText, practice, session: { inputMode, repetitions, requireCorrect, repeatOnError, errorRepetitions, mode: session.mode, duration, count, hints: session.hints, lines, hintPosition, hintTextSize, hintKeyboardSize },
  };
}

function validatePractice(value: unknown): Profile['practice'] {
  const p = object(value);
  const choice = <T extends string>(value: unknown, choices: readonly T[]): T => {
    if (!choices.includes(value as T)) throw new Error('Unknown practice setting.');
    return value as T;
  };
  const boolean = (value: unknown) => { if (typeof value !== 'boolean') throw new Error('Invalid practice option.'); return value; };
  const source = string(p.source);
  if (!['bank','drills','chords','fingers','sentences','two-key','quotes','numbers','number-sentences','symbols','text'].includes(source) && !/^(list|filter):.+$/.test(source)) throw new Error('Unknown exercise source.');
  const drillIds = wordDrills.map(d => d.id);
  if (typeof p.customPatterns !== 'string' || p.customPatterns.length > 2000) throw new Error('Invalid finger patterns.');
  return { source, restricted: boolean(p.restricted), drill: choice(p.drill, ['custom', ...drillIds]),
    mixed: [...new Set(array(p.mixed, id => choice(id, drillIds), 200))], keyboardSet: choice(p.keyboardSet, ['selected', ...Object.keys(keyboardSets)]),
    fingerBook: choice(p.fingerBook, ['duo','technique','custom']), section: integer(p.section, 0, fingerSections.length - 1), pattern: integer(p.pattern, -1, 500),
    repeats: integer(p.repeats, 1, 50), customPatterns: p.customPatterns, quoteLength: choice(p.quoteLength, ['short','medium','long']), symbolVariants: boolean(p.symbolVariants) };
}

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function loadProfile(getStorage: () => StorageLike) {
  try {
    const storage = getStorage();
    const raw = storage.getItem(profileKey) ?? storage.getItem('steno-jig.profile.v1');
    return { profile: raw ? validateProfile(JSON.parse(raw)) : defaultProfile(), writable: true, warning: '' };
  } catch {
    return {
      profile: defaultProfile(), writable: false,
      warning: 'Saved data could not be read. Your existing data has not been replaced. Changes work in memory; export a backup before leaving.',
    };
  }
}
export function saveProfile(getStorage: () => StorageLike, profile: Profile) {
  try { getStorage().setItem(profileKey, JSON.stringify(profile)); return true; }
  catch { return false; }
}
export const exportBackup = (profile: Profile) => JSON.stringify({ app: 'steno-drills', version: 1, profile }, null, 2);
export function importBackup(text: string) {
  if (text.length > 5_000_000) throw new Error('Backup is too large (maximum 5 MB).');
  const value = object(JSON.parse(text));
  if (!['steno-drills', 'steno-jig'].includes(String(value.app)) || value.version !== 1) throw new Error('Choose a Steno Drills version 1 backup.');
  return validateProfile(value.profile);
}
