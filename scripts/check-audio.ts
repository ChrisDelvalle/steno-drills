import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateAudioManifest } from '../src/domain/recordedAudio';
import { approvedWaveData } from './approved-wave';
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
const listeningBatches = new Map<string, { approved: { id: string; word: string; sha256: string; rating: string }[] }>();
for (const id of covered) {
  const result = quality.results[id], a = result.acoustic;
  if (!/^[a-f0-9]{64}$/.test(result.sourceSha256) || !a || a.passed !== true || typeof a.samePhones !== 'boolean' || !Number.isFinite(a.perPhoneLossIncrease) || (!a.samePhones && a.perPhoneLossIncrease > .25) || !Array.isArray(a.sourcePhones) || !a.sourcePhones.length || !Array.isArray(a.decodedPhones) || !a.decodedPhones.length) throw Error(`Audio acoustic review failed: ${id}`);
  if (catalog.variants.find((v: {id: string}) => v.id === id)?.requirePhoneMatch && (a.requiresPhoneMatch !== true || !a.samePhones)) throw Error(`Audio contrast review failed: ${id}`);
  const expected = catalog.variants.find((v: {id: string}) => v.id === id)?.reviewedRecording;
  if (a.dictionaryPhonesMatched !== true || expected) {
    if (!expected || JSON.stringify(a.reviewedRecording) !== JSON.stringify(expected) || !/^data\/audio\/repairs\/[a-z-]+\.json$/.test(expected.metadata) || hash(await readFile(new URL(expected.metadata, root))) !== expected.sha256) throw Error(`Missing source pronunciation review: ${id}`);
    const review = JSON.parse(await readFile(new URL(expected.metadata, root), 'utf8'));
    if (review.target !== id || review.recipeHash !== source.recipeHash || !/^data\/audio\/repairs\/[a-z-]+\.wav$/.test(review.source) || hash(await readFile(new URL(review.source, root))) !== review.sourceSha256 || review.review?.transcript?.toLowerCase().replace(/[.!?]$/, '') !== id.split('|')[0]) throw Error(`Invalid source pronunciation review: ${id}`);
    if (review.version === 2) {
      const clip = manifest.clips.find(c => `${c.word}|${c.phones}` === id)!;
      const wave = approvedWaveData(await readFile(new URL(review.source, root)));
      if (hash(wave.pcm) !== review.sampleSha256 || wave.samples !== review.samples || result.sourceSha256 !== review.sourceSha256 || result.sha256 !== review.assetSampleSha256 || clip.start !== 0 || clip.end !== review.samples || JSON.stringify(manifest.sprites[clip.sprite]) !== JSON.stringify(review.asset) || a.humanApproved !== true) throw Error(`Approved recording changed: ${id}`);
      const evidence = review.assetReview, comparison = evidence?.result;
      if (evidence?.policySha256 !== acousticPolicy || evidence?.recognizerRevision !== quality.recognizerRevision || !comparison || ['passed','samePhones','perPhoneLossIncrease','sourcePhones','decodedPhones'].some(k => JSON.stringify(comparison[k]) !== JSON.stringify(a[k])) || Object.keys(evidence.signal).some(k => JSON.stringify(evidence.signal[k]) !== JSON.stringify(result[k]))) throw Error(`Approved codec review changed: ${id}`);
      if (review.asset.url.endsWith('.opus') && !a.samePhones) throw Error(`Approved recording lost a phone: ${id}`);
      const approval = review.approval;
      if (!approval || !/^data\/audio\/repairs\/[a-z0-9-]+\.json$/.test(approval.file) || hash(await readFile(new URL(approval.file,root))) !== approval.sha256 || !(approval.id === id || approval.id.startsWith(id+':'))) throw Error(`Invalid listening approval: ${id}`);
      const batch = JSON.parse(await readFile(new URL(approval.file,root),'utf8'));
      if (batch.version !== 1 || !batch.approved?.some((v: {id: string;word: string;sha256: string;rating: string}) => v.id === approval.id && v.word === clip.word && v.sha256 === review.sampleSha256 && v.rating === 'good')) throw Error(`Missing listening approval: ${id}`);
      listeningBatches.set(approval.file,batch);
    } else if (review.version !== 1) throw Error(`Unsupported pronunciation review: ${id}`);
  }
}
for (const batch of listeningBatches.values()) for (const vote of batch.approved) {
  if (covered.has(vote.id) && !catalog.variants.find((v: {id: string}) => v.id === vote.id)?.reviewedRecording && quality.results[vote.id].sha256 !== vote.sha256) throw Error(`Previously approved recording changed: ${vote.id}`);
}
for (const sprite of manifest.sprites) { const bytes = await readFile(new URL(`public${sprite.url}`,root)); if (bytes.length !== sprite.bytes || hash(bytes) !== sprite.sha256) throw Error(`Invalid sprite: ${sprite.url}`); }
console.log(`${manifest.sprites.length} sprites validated; ${manifest.clips.length} clips; ${manifest.fallback.length} fallback entries`);
