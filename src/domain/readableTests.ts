import { defaultProfile, validateProfile } from './profile';
import { shareCatalog } from './shareCatalog';
import { speechRates } from './listening';
import type { Profile } from './types';
import type { ShareResult } from './sharing';

type Source = typeof shareCatalog.sources[number];
interface Parameter {
  type: 'string' | 'number' | 'boolean' | 'list' | 'concepts';
  default: string | number | boolean | readonly string[];
  values?: readonly (string | number)[];
  min?: number;
  max?: number;
  integer?: boolean;
  sources?: readonly Source[];
  description: string;
}
const defaults = defaultProfile();
const wordSources = ['bank', 'drills'] as const;
const conceptSources = ['bank', 'drills', 'chords'] as const;
export const readableConceptPresets = {
  none: shareCatalog.conceptPresets[0], single: shareCatalog.conceptPresets[1],
  starter: shareCatalog.conceptPresets[2], all: shareCatalog.conceptPresets[3],
};
export const maxReadableFragmentBytes = 16 * 1024;
export const readableParameters = {
  exercise: { type: 'string', default: defaults.practice.source, values: shareCatalog.sources, description: 'Built-in exercise ID.' },
  seconds: { type: 'number', default: defaults.session.duration, values: shareCatalog.durations, integer: true, description: 'Timed session duration. Cannot be combined with count.' },
  count: { type: 'number', default: defaults.session.count, values: shareCatalog.counts, integer: true, description: 'Count session. Without seconds or count, use 60 seconds. For fingers, quotes, and two-key, use 25 to select the complete passage.' },
  hints: { type: 'boolean', default: defaults.session.hints, description: 'Enable chord hints. Hidden audio text still requires explicit reveal.' },
  pool: { type: 'string', default: defaults.filter.pool, values: ['common', 'all'], sources: ['bank'], description: 'Common vocabulary or the eligible dictionary.' },
  concepts: { type: 'concepts', default: 'starter', sources: conceptSources, description: 'none, single, starter, all, or comma-separated concept IDs. Requires restricted=true for drills and keyboardSet=selected for chords. Chord exercises omit briefs.' },
  focus: { type: 'string', default: defaults.filter.focus, values: ['', ...shareCatalog.concepts], sources: wordSources, description: 'Require this concept in a qualifying outline. Requires restricted=true for drills. Does not unlock missing concepts.' },
  minLength: { type: 'number', default: defaults.filter.minLength, min: 1, max: 100, integer: true, sources: ['bank'], description: 'Minimum word length; must not exceed maxLength.' },
  maxLength: { type: 'number', default: defaults.filter.maxLength, min: 1, max: 100, integer: true, sources: ['bank'], description: 'Maximum word length.' },
  inputMode: { type: 'string', default: defaults.session.inputMode, values: ['text', 'steno'], sources: wordSources, description: 'Translated text or raw outline input.' },
  groupSize: { type: 'number', default: defaults.session.groupSize, min: 1, max: 10, integer: true, sources: wordSources, description: 'Words per practice group.' },
  repetitions: { type: 'number', default: defaults.session.repetitions, min: 1, max: 10, integer: true, sources: wordSources, description: 'Correct passes per group.' },
  requireCorrect: { type: 'boolean', default: defaults.session.requireCorrect, sources: wordSources, description: 'Require correction of submitted mistakes.' },
  repeatOnError: { type: 'boolean', default: defaults.session.repeatOnError, sources: wordSources, description: 'Enable recovery repetitions after a mistake.' },
  errorRepetitions: { type: 'number', default: defaults.session.errorRepetitions, min: 1, max: 10, integer: true, sources: wordSources, description: 'Recovery passes; requires repeatOnError=true. Recovery uses the larger of this and repetitions.' },
  audio: { type: 'boolean', default: defaults.session.listening.enabled, sources: wordSources, description: 'Enable self-paced audio. Voice selection stays personal.' },
  display: { type: 'string', default: defaults.session.listening.display, values: ['full', 'current', 'hidden'], sources: wordSources, description: 'Audio text presentation; requires audio=true.' },
  rate: { type: 'number', default: defaults.session.listening.rate, values: speechRates, sources: wordSources, description: 'Audio speed multiplier; requires audio=true.' },
  drills: { type: 'list', default: [defaults.practice.drill], values: shareCatalog.drills, sources: ['drills'], description: 'Comma-separated built-in drill IDs. An empty value selects an empty mix.' },
  restricted: { type: 'boolean', default: defaults.practice.restricted, sources: ['drills'], description: 'Filter built-in word drills by selected concepts.' },
  keyboardSet: { type: 'string', default: defaults.practice.keyboardSet, values: shareCatalog.keyboards, sources: ['chords'], description: 'selected uses concepts; otherwise choose a catalog keyboard set.' },
  fingerBook: { type: 'string', default: defaults.practice.fingerBook, values: ['duo', 'technique'], sources: ['fingers'], description: 'Built-in finger pattern book.' },
  section: { type: 'number', default: defaults.practice.section, min: 0, max: shareCatalog.fingerSections.length - 1, integer: true, sources: ['fingers'], description: 'Zero-based Duo section. Omit for technique.' },
  pattern: { type: 'number', default: defaults.practice.pattern, min: -1, max: Math.max(shareCatalog.techniquePatterns.length, ...shareCatalog.fingerSections.map(s => s.length)) - 1, integer: true, sources: ['fingers'], description: 'Zero-based pattern in the selected section/book; -1 selects all.' },
  repeats: { type: 'number', default: defaults.practice.repeats, min: 1, max: 50, integer: true, sources: ['fingers'], description: 'Finger pattern repetitions.' },
  quoteLength: { type: 'string', default: defaults.practice.quoteLength, values: shareCatalog.quoteLengths, sources: ['quotes'], description: 'Quote length category.' },
  symbolVariants: { type: 'boolean', default: defaults.practice.symbolVariants, sources: ['symbols'], description: 'Include symbol variants.' },
} satisfies Record<string, Parameter>;
type ParameterName = keyof typeof readableParameters;

/** Declarative URL inputs become an ordinary profile snapshot, never a personal profile. */
export function parseReadableProfile(params: URLSearchParams): ShareResult<Profile> {
  try {
    const parsed = new Map<ParameterName, string | number | boolean | string[]>();
    for (const [name, raw] of params) {
      if (!Object.hasOwn(readableParameters, name)) throw new Error(`Unknown test parameter: ${name.slice(0, 80)}.`);
      const key = name as ParameterName, spec: Parameter = readableParameters[key];
      if (parsed.has(key)) throw new Error(`Duplicate test parameter: ${key}.`);
      let value: string | number | boolean | string[] = raw;
      if (spec.type === 'number') {
        if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) throw new Error(`${key} must be a number.`);
        value = Number(raw);
        if (!Number.isFinite(value) || (spec.integer && !Number.isSafeInteger(value))) throw new Error(`${key} must be a ${spec.integer ? 'whole ' : ''}number.`);
        if (spec.min !== undefined && value < spec.min || spec.max !== undefined && value > spec.max) throw new Error(`${key} must be between ${spec.min} and ${spec.max}.`);
      } else if (spec.type === 'boolean') {
        if (raw !== 'true' && raw !== 'false') throw new Error(`${key} must be true or false.`);
        value = raw === 'true';
      } else if (spec.type === 'list') value = raw === '' ? [] : raw.split(',');
      else if (spec.type === 'concepts') {
        value = Object.hasOwn(readableConceptPresets, raw) ? [...readableConceptPresets[raw as keyof typeof readableConceptPresets]] : raw.split(',');
        if (value.some(id => !(shareCatalog.concepts as readonly string[]).includes(id))) throw new Error('Unknown concepts. Use catalog IDs or none, single, starter, all.');
      }
      if (spec.values && (Array.isArray(value) ? value.some(v => !spec.values!.includes(v)) : !spec.values.includes(value as string | number))) {
        throw new Error(`Unsupported ${key}. Use the supported values in agent-catalog.json.`);
      }
      parsed.set(key, value);
    }
    if (parsed.has('seconds') && parsed.has('count')) throw new Error('Choose seconds or count, not both.');
    const profile = defaultProfile();
    profile.lists = []; profile.exercises = [];
    const source = (parsed.get('exercise') || defaults.practice.source) as Source;
    profile.practice.source = source;
    for (const key of parsed.keys()) {
      const spec: Parameter = readableParameters[key];
      if (spec.sources && !spec.sources.includes(source)) throw new Error(`${key} is not available for ${source}.`);
    }
    const get = <T>(key: ParameterName, fallback: T) => (parsed.has(key) ? parsed.get(key) : fallback) as T;
    profile.filter = { pool: get('pool', profile.filter.pool), focus: get('focus', ''), minLength: get('minLength', profile.filter.minLength), maxLength: get('maxLength', profile.filter.maxLength),
      concepts: { mode: 'custom', selected: get('concepts', [...readableConceptPresets.starter]) } };
    if (profile.filter.minLength > profile.filter.maxLength) throw new Error('minLength must not exceed maxLength.');
    if (parsed.has('count')) { profile.session.mode = 'count'; profile.session.count = get('count', profile.session.count); }
    else profile.session.duration = get('seconds', profile.session.duration);
    if (parsed.has('count') && ['fingers', 'quotes', 'two-key'].includes(source) && profile.session.count !== defaults.session.count) throw new Error(`Use count=${defaults.session.count} for the complete ${source} passage.`);
    profile.session.hints = get('hints', profile.session.hints);
    for (const key of ['inputMode', 'groupSize', 'repetitions', 'requireCorrect', 'repeatOnError', 'errorRepetitions'] as const) {
      Object.assign(profile.session, { [key]: get(key, profile.session[key]) });
    }
    if (parsed.has('errorRepetitions') && !profile.session.repeatOnError) throw new Error('errorRepetitions requires repeatOnError=true.');
    profile.session.listening = { enabled: get('audio', false), display: get('display', profile.session.listening.display), rate: get('rate', profile.session.listening.rate) };
    if (!profile.session.listening.enabled && (parsed.has('display') || parsed.has('rate'))) throw new Error('display and rate require audio=true.');
    for (const key of ['restricted', 'keyboardSet', 'fingerBook', 'section', 'pattern', 'repeats', 'quoteLength', 'symbolVariants'] as const) {
      Object.assign(profile.practice, { [key]: get(key, profile.practice[key]) });
    }
    if (source === 'drills') {
      const drills = [...new Set(get('drills', [profile.practice.drill]))];
      profile.practice.mixed = drills;
      profile.practice.drill = drills.length === 1 ? drills[0] : 'custom';
      if (!profile.practice.restricted && (parsed.has('concepts') || parsed.has('focus'))) throw new Error('concepts and focus require restricted=true.');
    }
    if (source === 'chords' && profile.practice.keyboardSet !== 'selected' && parsed.has('concepts')) throw new Error('concepts requires keyboardSet=selected.');
    if (source === 'fingers') {
      if (profile.practice.fingerBook === 'technique' && parsed.has('section')) throw new Error('section is only available for fingerBook=duo.');
      const patterns = profile.practice.fingerBook === 'duo' ? shareCatalog.fingerSections[profile.practice.section] : shareCatalog.techniquePatterns;
      if (profile.practice.pattern >= patterns.length) throw new Error(`pattern must be -1 or an index from 0 to ${patterns.length - 1} for this section.`);
    }
    return { ok: true, value: validateProfile(profile) };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Invalid readable test link.' }; }
}
