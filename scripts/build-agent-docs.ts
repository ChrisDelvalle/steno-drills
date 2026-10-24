import { readFile, writeFile } from 'node:fs/promises';
import { concepts } from '../src/domain/concepts';
import { builtInExercises, keyboardSets, wordDrills } from '../src/domain/exercises';
import { maxReadableFragmentBytes, readableConceptPresets, readableParameters } from '../src/domain/readableTests';
import { shareCatalog } from '../src/domain/shareCatalog';
import { parseTestLocation } from '../src/domain/sharing';

const root = new URL('../', import.meta.url), origin = 'https://steno.chrisdelvalle.com';
const checksOnly = process.argv.includes('--check');
const parameters = Object.entries(readableParameters).map(([name, spec]) => {
  const allowed = 'values' in spec ? ` Values: ${spec.values.map(v => `\`${v === '' ? '(empty)' : v}\``).join(', ')}.` : 'min' in spec ? ` ${spec.integer ? 'Whole number' : 'Number'} from ${spec.min} to ${spec.max}.` : '';
  return `- \`${name}\` — ${spec.description}${allowed} Default: \`${Array.isArray(spec.default) ? spec.default.join(',') : spec.default === '' ? '(empty)' : spec.default}\`.${'sources' in spec ? ` Exercises: ${spec.sources.map(s => `\`${s}\``).join(', ')}.` : ''}`;
}).join('\n');
const source = await readFile(new URL('docs/agents.md', root), 'utf8');
if (source.split('{{parameters}}').length !== 2) throw new Error('Agent guide needs exactly one parameter-reference placeholder.');
const markdown = source.replace('{{parameters}}', parameters);
const examples = [...markdown.matchAll(/https:\/\/steno\.chrisdelvalle\.com\/#\/practice\?[^\s)`]+/g)].map(match => match[0]);
if (examples.length < 10) throw new Error('Missing agent guide examples.');
for (const url of examples) {
  const location = parseTestLocation(new URL(url).hash);
  if (!location.shared || location.error) throw new Error(`Invalid guide example: ${url}: ${location.error}`);
}

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function inline(text: string) {
  let html = '', offset = 0;
  for (const match of text.matchAll(/`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g)) {
    html += escape(text.slice(offset, match.index));
    if (match[1] !== undefined) html += `<code>${escape(match[1])}</code>`;
    else {
      if (!match[3].startsWith(origin + '/')) throw new Error('Agent documentation links must use the canonical site origin.');
      html += `<a href="${escape(match[3])}">${escape(match[2])}</a>`;
    }
    offset = match.index! + match[0].length;
  }
  return html + escape(text.slice(offset));
}
// The owned guide uses only headings, paragraphs, bullet lists, inline code and links.
// Render that small subset without introducing a browser or build dependency.
function renderGuide(text: string) {
  const blocks = text.trim().split(/\n\s*\n/);
  return blocks.map(block => {
    const heading = /^(#{1,6}) (.+)$/.exec(block);
    if (heading) return `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    if (block.startsWith('- ')) return `<ul>\n${block.split('\n').map(line => {
      if (!line.startsWith('- ')) throw new Error('Unsupported list formatting in agent guide.');
      return `<li>${inline(line.slice(2))}</li>`;
    }).join('\n')}\n</ul>`;
    return `<p>${inline(block.replaceAll('\n', ' '))}</p>`;
  }).join('\n');
}
const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Steno Drills agent guide</title><meta name="description" content="Construct static Steno Drills test links with readable URL parameters."><link rel="alternate" type="text/markdown" href="/agents.md"><link rel="describedby" type="application/json" href="/agent-catalog.json"></head><body><main>\n${renderGuide(markdown)}\n</main></body></html>\n`;
const catalog = {
  version: 1, origin, route: '/#/practice', maximumFragmentBytes: maxReadableFragmentBytes,
  documentation: { html: origin + '/agents.html', markdown: origin + '/agents.md', llms: origin + '/llms.txt' },
  parameters: readableParameters,
  exercises: builtInExercises.filter(([id]) => (shareCatalog.sources as readonly string[]).includes(id)).map(([id, label]) => ({ id, label })),
  concepts, presets: readableConceptPresets,
  drills: wordDrills.map(({ id, label, group }) => ({ id, label, group })),
  keyboardSets: shareCatalog.keyboards.map(id => ({ id, ...(id === 'selected' ? { description: 'Use the supplied concepts, without briefs.' } : { strokes: keyboardSets[id] }) })),
  fingerBooks: [
    { id: 'duo', sections: shareCatalog.fingerSections.map((patterns, section) => ({ section, patterns: patterns.map((outline, pattern) => ({ pattern, outline })) })) },
    { id: 'technique', patterns: shareCatalog.techniquePatterns.map((outline, pattern) => ({ pattern, outline })) },
  ],
  defaults: Object.fromEntries(Object.entries(readableParameters).filter(([name]) => ['exercise', 'seconds', 'hints', 'pool', 'concepts', 'minLength', 'maxLength', 'inputMode', 'groupSize', 'repetitions', 'requireCorrect', 'repeatOnError', 'audio'].includes(name)).map(([name, spec]) => [name, spec.default])),
  examples,
};
const defaultLocation = parseTestLocation('#/practice?' + new URLSearchParams(Object.entries(catalog.defaults).map(([name, value]) => [name, String(value)])));
if (!defaultLocation.shared || defaultLocation.error) throw new Error('Catalog defaults do not describe a valid test.');
for (const [name, content] of Object.entries({ 'agents.md': markdown, 'agents.html': html, 'llms.txt': markdown, 'agent-catalog.json': JSON.stringify(catalog, null, 2) + '\n' })) {
  const path = new URL('public/' + name, root);
  if (checksOnly) {
    const actual = await readFile(path, 'utf8').catch(() => '');
    if (actual !== content) throw new Error(`${name} is out of date. Run npm run agents:build.`);
  } else await writeFile(path, content);
}
const homepage = await readFile(new URL('index.html', root), 'utf8');
const headers = await readFile(new URL('public/_headers', root), 'utf8');
for (const name of ['/agents.html', '/agents.md', '/agent-catalog.json', '/llms.txt']) {
  if (!homepage.includes(name) || !headers.includes(name)) throw new Error(`Missing nonvisual discovery reference: ${name}`);
}
if (!homepage.includes('application/ld+json')) throw new Error('Missing structured agent documentation reference.');
console.log(`${checksOnly ? 'Validated' : 'Generated'} agent documentation: ${examples.length} examples, ${concepts.length} concepts, ${wordDrills.length} drills.`);
