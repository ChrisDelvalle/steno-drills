import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { concepts } from '../src/domain/concepts';
import { analyzeOutline } from '../src/domain/classifier';
import { evaluate } from '../src/domain/vocabulary';
import type { Dictionary } from '../src/domain/types';

const root = new URL('../', import.meta.url);
const dictionaryBytes = await readFile(new URL('public/dictionary.json', root));
const dictionary: Dictionary = JSON.parse(dictionaryBytes.toString());
const ids = concepts.map(c => c.id);
const overrides = JSON.parse(await readFile(new URL('data/audio/overrides.json', root), 'utf8'));
const variants = dictionary.words.filter(w => evaluate(w, ids).eligible).flatMap(entry => {
  const canonical = evaluate(entry, ids);
  const byPhones = new Map<string, string[]>();
  for (const phones of entry.pronunciations) {
    const key = phones.map(p => p.replace(/[012]$/, '')).join(' ');
    const outlines = entry.outlines.filter(o => o.requirements.length && analyzeOutline(entry.word, o.outline, [phones]).requirements.length).map(o => o.outline);
    if (outlines.length) byPhones.set(key, [...new Set([...(byPhones.get(key) || []), ...outlines])]);
  }
  const requirements = canonical.requirements.map(id => concepts.find(c => c.id === id)!).filter(Boolean);
  const chordOrder = ['initial','vowel','final','brief'].map(position => requirements.filter(c => c.position === position).map(c => c.keys).join('+')).join('|');
  return [...byPhones].map(([phones, outlines]) => ({ id: `${entry.word}|${phones}`, word: entry.word, phones, outlines,
    common: entry.rank !== undefined, chordOrder, text: overrides[`${entry.word}|${phones}`]?.text || entry.word,
    note: overrides[`${entry.word}|${phones}`]?.note || '',
    ...(overrides[`${entry.word}|${phones}`]?.preferred ? { preferred: true } : {}),
    ...(overrides[`${entry.word}|${phones}`]?.requirePhoneMatch ? { requirePhoneMatch: true } : {}),
    ...(overrides[`${entry.word}|${phones}`]?.spokenPhones ? { spokenPhones: overrides[`${entry.word}|${phones}`].spokenPhones } : {}),
    ...(overrides[`${entry.word}|${phones}`]?.reviewedRecording ? { reviewedRecording: overrides[`${entry.word}|${phones}`].reviewedRecording } : {}),
    ...(overrides[`${entry.word}|${phones}`]?.extractFrom ? { extractFrom: overrides[`${entry.word}|${phones}`].extractFrom } : {}) }));
}).sort((a,b) => Number(b.common) - Number(a.common) || a.chordOrder.localeCompare(b.chordOrder, 'en') || a.word.localeCompare(b.word,'en') || a.phones.localeCompare(b.phones,'en'));
const data = JSON.stringify({ version: 1, dictionarySha256: createHash('sha256').update(dictionaryBytes).digest('hex'), source: JSON.parse(await readFile(new URL('data/sources/sources.lock.json', root),'utf8')).plover,
  words: new Set(variants.map(v => v.word)).size, common: new Set(variants.filter(v => v.common).map(v => v.word)).size, variants }, null, 2) + '\n';
await mkdir(new URL('data/audio/',root), {recursive:true});
const target = new URL('data/audio/catalog.json',root);
if (process.argv.includes('--check')) { if (await readFile(target,'utf8') !== data) throw Error('Audio catalog is stale. Run npm run audio:catalog.'); }
else await writeFile(target,data);
console.log(`${new Set(variants.map(v => v.word)).size} words; ${variants.length} pronunciation targets`);
