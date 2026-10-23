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
const covered = new Set(manifest.clips.map(c => `${c.word}|${c.phones}`));
for (const item of manifest.fallback) { if (!item.reason || item.reason === 'Generation pending' || covered.has(item.id)) throw Error('Unresolved collection entry.'); covered.add(item.id); }
if (covered.size !== catalog.variants.length || catalog.variants.some((v: { id: string }) => !covered.has(v.id))) throw Error('Incomplete audio coverage.');
for (const sprite of manifest.sprites) { const bytes = await readFile(new URL(`public${sprite.url}`,root)); if (bytes.length !== sprite.bytes || hash(bytes) !== sprite.sha256) throw Error(`Invalid sprite: ${sprite.url}`); }
console.log(`${manifest.sprites.length} sprites validated; ${manifest.clips.length} clips; ${manifest.fallback.length} fallback entries`);
