// Explicit network operation. Normal builds use only the pinned local files.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = new URL('../data/sources/', import.meta.url);
await mkdir(directory, { recursive: true });
const lockPath = new URL('sources.lock.json', directory);
let lock = {};
try { lock = JSON.parse(await readFile(lockPath, 'utf8')); } catch { /* First download. */ }
for (const [name, repo, branch, path, licensePath] of [
  ['plover', 'opensteno/plover', 'main', 'plover/assets/main.json', 'LICENSE.txt'],
  ['cmudict', 'cmusphinx/cmudict', 'master', 'cmudict.dict', 'LICENSE'],
]) {
  const response = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`);
  if (!response.ok) throw new Error(`Cannot resolve ${repo}: ${response.status}`);
  const { sha } = await response.json();
  const files = {};
  for (const [file, remotePath] of [[`${name}.${name === 'plover' ? 'json' : 'dict'}`, path], [`${name}.LICENSE`, licensePath], ...(name === 'plover' ? [['plover-commands.json', 'plover/assets/commands.json']] : [])]) {
    const url = `https://raw.githubusercontent.com/${repo}/${sha}/${remotePath}`;
    const asset = await fetch(url);
    if (!asset.ok) throw new Error(`Cannot download ${url}: ${asset.status}`);
    const bytes = Buffer.from(await asset.arrayBuffer());
    await writeFile(new URL(file, directory), bytes);
    files[file] = { path: remotePath, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  lock[name] = { repository: `https://github.com/${repo}`, revision: sha, files };
  console.log(`Pinned ${name}: ${sha}`);
}
await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
