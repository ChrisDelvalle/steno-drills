import { conceptMap, starterSkills } from './concepts';
import { parseStroke, phoneSet, syllableCount } from './classifier';
import type { Filter, Profile, WordCorrection } from './types';

export const profileKey = 'steno-drills.profile.v1';
export const defaultFilter = (): Filter => ({ pool: 'common', focus: '', minLength: 1, maxLength: 30 });
export const defaultProfile = (): Profile => ({
  version: 1, learned: [...starterSkills], lists: [], corrections: [], excluded: [],
  exercises: [{ id: 'everything', name: 'Everything I know', filter: defaultFilter() }],
  filter: defaultFilter(), theme: 'system', customText: '', session: { mode: 'timed', duration: 60, count: 25, hints: true },
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
export function validateFilter(v: unknown): Filter {
  const f = object(v);
  if (f.pool !== 'common' && f.pool !== 'all') throw new Error('Unknown word pool.');
  const minLength = integer(f.minLength, 1, 100), maxLength = integer(f.maxLength, 1, 100);
  if (minLength > maxLength) throw new Error('Minimum word length must not exceed maximum.');
  return { pool: f.pool, focus: f.focus === '' ? '' : learnedConcept(f.focus), minLength, maxLength };
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
    return { id: string(e.id), name: string(e.name, 80), filter: validateFilter(e.filter) };
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
  const duration = integer(session.duration, 30, 300), count = integer(session.count, 10, 500);
  if (![30, 60, 120, 300].includes(duration) || ![10, 25, 50, 100, 250, 500].includes(count)) throw new Error('Unsupported practice length.');
  return {
    version: 1, learned: [...new Set(array(p.learned, learnedConcept, 500))], lists, exercises, corrections,
    excluded: [...new Set(array(p.excluded, word))], filter: validateFilter(p.filter),
    theme: p.theme as Profile['theme'], customText: p.customText, session: { mode: session.mode, duration, count, hints: session.hints },
  };
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
