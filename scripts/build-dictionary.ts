import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { makeEntry } from '../src/domain/classifier';
import { starterSkills } from '../src/domain/concepts';
import { evaluate } from '../src/domain/vocabulary';
import type { Dictionary } from '../src/domain/types';

const root = new URL('../', import.meta.url);
const sources = new URL('data/sources/', root);
const lock = JSON.parse(await readFile(new URL('sources.lock.json', sources), 'utf8'));
for (const source of Object.values(lock) as { files: Record<string, { sha256: string }> }[]) {
  for (const [file, metadata] of Object.entries(source.files)) {
    const bytes = await readFile(new URL(file, sources));
    if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new Error(`Source checksum mismatch: ${file}`);
  }
}
const plover: Record<string, string> = JSON.parse(await readFile(new URL('plover.json', sources), 'utf8'));
const cmu = await readFile(new URL('cmudict.dict', sources), 'utf8');
const ngsl: string[] = JSON.parse(await readFile(new URL('ngsl.json', sources), 'utf8'));
const ranks = new Map(ngsl.map((word, rank) => [word.toLowerCase(), rank]));
const pronunciations = new Map<string, string[][]>();
for (const line of cmu.split(/\r?\n/)) {
  const [rawWord, ...rest] = line.trim().split(/\s+/);
  const word = rawWord.replace(/\(\d+\)$/, '');
  const phones = rest.slice(0, rest.includes('#') ? rest.indexOf('#') : rest.length);
  if (!word || !phones.length) continue;
  const alternatives = pronunciations.get(word) || [];
  alternatives.push(phones);
  pronunciations.set(word, alternatives);
}
const outlines = new Map<string, string[]>();
for (const [outline, word] of Object.entries(plover)) {
  // Keep literal single-word translations, including contractions. Plover
  // commands, glue/affix syntax, phrases and proper-name capitalization stay out.
  if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word)) continue;
  const alternatives = outlines.get(word) || [];
  alternatives.push(outline);
  outlines.set(word, alternatives);
}
const words = [...outlines].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([word, strokes]) =>
  makeEntry(word, strokes.sort((a, b) => a.length - b.length || a.localeCompare(b, 'en')), pronunciations.get(word) || [], ranks.get(word)),
);
const classified = words.filter(w => w.syllables.length === 1 && w.syllables[0] === 1 && w.outlines.some(o => o.requirements.length));
const starter = words.filter(w => evaluate(w, starterSkills).eligible);
const dictionary: Dictionary = {
  version: 1, words,
  report: {
    entries: Object.keys(plover).length, words: words.length,
    monosyllables: words.filter(w => w.syllables.length === 1 && w.syllables[0] === 1).length,
    classified: classified.length, starter: starter.length,
    starterCommon: starter.filter(w => w.rank !== undefined).length,
    missingPronunciation: words.filter(w => !w.pronunciations.length).length,
    unexplained: words.filter(w => !w.outlines.some(o => o.requirements.length)).length,
  },
};
const json = JSON.stringify(dictionary);
const notices = [
  'Steno Drills — third-party notices',
  'Original Steno Jig code and NGSL extraction: Joshua I. Grams. Original MIT notice follows.',
  await readFile(new URL('LICENSE', root), 'utf8'),
  `Plover default main.json dictionary: ${lock.plover.repository}/tree/${lock.plover.revision}\nPlover identifies its license as GPL version 2 or later. Source snapshot is in data/sources/plover.json in this app repository.`,
  await readFile(new URL('plover.LICENSE', sources), 'utf8'),
  `CMU Pronouncing Dictionary: ${lock.cmudict.repository}/tree/${lock.cmudict.revision}\nSource snapshot is in data/sources/cmudict.dict in this app repository.`,
  await readFile(new URL('cmudict.LICENSE', sources), 'utf8'),
].join('\n\n');
await mkdir(new URL('public/', root), { recursive: true });
for (const [file, contents] of [['dictionary.json', json], ['sources.lock.json', JSON.stringify(lock, null, 2) + '\n'], ['THIRD_PARTY_NOTICES.txt', notices]]) {
  const path = new URL(`public/${file}`, root);
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== contents) throw new Error(`${file} is stale. Run npm run data:build.`);
  } else await writeFile(path, contents);
}
console.log(JSON.stringify(dictionary.report, null, 2));
