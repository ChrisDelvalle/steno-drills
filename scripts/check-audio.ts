import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateAudioManifest } from '../src/domain/recordedAudio';
const root = new URL('../',import.meta.url);
const published = JSON.parse(await readFile(new URL('data/audio/published.json',root),'utf8'));
if (!/^\/audio\/instructor\/catalog\.[a-f0-9]{64}\.json$/.test(published.manifest)) throw Error('Invalid published collection.');
const bytes = await readFile(new URL(`public${published.manifest}`,root));
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
if (!published.manifest.includes(hash(bytes))) throw Error('Manifest checksum mismatch.');
const manifest = validateAudioManifest(JSON.parse(bytes.toString()));
const catalogBytes = await readFile(new URL('data/audio/catalog.json',root));
const catalog = JSON.parse(catalogBytes.toString());
const source = JSON.parse(bytes.toString());
if (source.catalogSha256 !== hash(catalogBytes) || source.words !== catalog.words || source.common !== catalog.common) throw Error('Collection source mismatch.');
if (manifest.fallback.length) throw Error('Every catalog pronunciation requires a recording; unresolved entries cannot be released.');
const covered = new Set(manifest.clips.map(c => `${c.word}|${c.phones}`));
if (covered.size !== catalog.variants.length || catalog.variants.some((v: { id: string }) => !covered.has(v.id))) throw Error('Incomplete audio coverage.');
if (new Set(manifest.clips.map(c => c.word)).size !== catalog.words) throw Error('Incomplete word coverage.');
const quality = JSON.parse(await readFile(new URL('data/audio/quality.json',root),'utf8'));
if (quality.version !== 1 || quality.manifest !== published.manifest || quality.policySha256 !== hash(await readFile(new URL('scripts/audio-audition/quality.py',root)))) throw Error('Audio signal review is stale.');
if (Object.keys(quality.results).length !== covered.size || [...covered].some(id => !quality.results[id] || quality.results[id].issues.length || !/^[a-f0-9]{64}$/.test(quality.results[id].sha256))) throw Error('Audio signal review is incomplete.');
const acousticPolicy = hash(Buffer.concat([await readFile(new URL('scripts/audio-audition/codec.py',root)), await readFile(new URL('scripts/audio-audition/phonetics.py',root))]));
if (quality.acousticPolicySha256 !== acousticPolicy || quality.maximumPerPhoneLossIncrease !== .25 || !/^[a-f0-9]{40}$/.test(quality.recognizerRevision)) throw Error('Audio acoustic review is stale.');
for (const id of covered) {
  const result = quality.results[id], a = result.acoustic;
  if (!/^[a-f0-9]{64}$/.test(result.sourceSha256) || !a || a.passed !== true || typeof a.samePhones !== 'boolean' || !Number.isFinite(a.perPhoneLossIncrease) || (!a.samePhones && a.perPhoneLossIncrease > .25) || !Array.isArray(a.sourcePhones) || !a.sourcePhones.length || !Array.isArray(a.decodedPhones) || !a.decodedPhones.length) throw Error(`Audio acoustic review failed: ${id}`);
  if (catalog.variants.find((v: {id: string}) => v.id === id)?.requirePhoneMatch && (a.requiresPhoneMatch !== true || !a.samePhones)) throw Error(`Audio contrast review failed: ${id}`);
  if (a.dictionaryPhonesMatched !== true) {
    const expected = catalog.variants.find((v: {id: string}) => v.id === id)?.reviewedRecording;
    if (!expected || JSON.stringify(a.reviewedRecording) !== JSON.stringify(expected) || !/^data\/audio\/repairs\/[a-z-]+\.json$/.test(expected.metadata) || hash(await readFile(new URL(expected.metadata, root))) !== expected.sha256) throw Error(`Missing source pronunciation review: ${id}`);
    const review = JSON.parse(await readFile(new URL(expected.metadata, root), 'utf8'));
    if (review.target !== id || review.recipeHash !== source.recipeHash || !/^data\/audio\/repairs\/[a-z-]+\.wav$/.test(review.source) || hash(await readFile(new URL(review.source, root))) !== review.sourceSha256 || review.review?.transcript?.toLowerCase().replace(/[.!?]$/, '') !== id.split('|')[0]) throw Error(`Invalid source pronunciation review: ${id}`);
  }
}
for (const sprite of manifest.sprites) { const bytes = await readFile(new URL(`public${sprite.url}`,root)); if (bytes.length !== sprite.bytes || hash(bytes) !== sprite.sha256) throw Error(`Invalid sprite: ${sprite.url}`); }
console.log(`${manifest.sprites.length} sprites validated; ${manifest.clips.length} clips; ${manifest.fallback.length} fallback entries`);
