import type { ReactNode } from 'react';
import { PlayIcon, CheckCircleIcon, BookOpenIcon, DocumentTextIcon, Cog6ToothIcon, ArrowRightIcon, ArrowLeftIcon, PlusIcon, ArrowDownTrayIcon, ArrowPathIcon, XMarkIcon, LightBulbIcon, LinkIcon } from '@heroicons/react/24/outline';
import { concepts, conceptBanks, conceptLabel } from './domain/concepts';
import { selectedConcepts } from './domain/vocabulary';
import { parseStroke } from './domain/classifier';
import type { Filter } from './domain/types';

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const icons = {
    practice: PlayIcon, skills: CheckCircleIcon, words: BookOpenIcon,
    exercises: DocumentTextIcon, settings: Cog6ToothIcon, arrow: ArrowRightIcon,
    back: ArrowLeftIcon, plus: PlusIcon, download: ArrowDownTrayIcon, refresh: ArrowPathIcon, close: XMarkIcon, hint: LightBulbIcon, share: LinkIcon,
  };
  const Component = icons[name as keyof typeof icons] || BookOpenIcon;
  return <Component width={size} height={size} aria-hidden="true"/>;
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty"><p>{title}</p><p>{children}</p></div>;
}
export function ConceptPicker({ filter, learned, onChange }: { filter: Filter; learned: string[]; onChange: (filter: Filter) => void }) {
  const mode = filter.concepts?.mode || 'personal';
  const selected = selectedConcepts(filter, learned);
  const update = (ids: string[]) => onChange({ ...filter, concepts: { mode: 'custom', selected: ids } });
  return <div className="concept-picker">
    <label>Concepts<select aria-label="Concepts" value={mode} onChange={e => onChange({ ...filter, focus: '', concepts: { mode: e.target.value as NonNullable<Filter['concepts']>['mode'], selected: [...selected] } })}>
      <option value="single">Single keys</option><option value="starter">Starter</option><option value="personal">Skills</option><option value="all">All</option><option value="custom">Custom</option>
    </select></label>
    {mode === 'custom' && <div className="concept-checklist">
      <div className="concept-actions"><button type="button" className="text-button" onClick={() => update([...learned])}>Use skills</button><button type="button" className="text-button" onClick={() => update(concepts.map(c => c.id))}>Select all</button><button type="button" className="text-button" onClick={() => update([])}>Clear</button></div>
      {conceptBanks.map(([bank, label]) => {
        const group = concepts.filter(c => c.bank === bank);
        const all = group.every(c => selected.includes(c.id));
        return <fieldset key={bank} className="concept-group"><legend>{label}</legend>
          <button type="button" className="text-button group-toggle" onClick={() => update(all ? selected.filter(id => !group.some(c => c.id === id)) : [...new Set([...selected, ...group.map(c => c.id)])])}>{all ? 'Clear' : 'Select all'}<span className="sr-only"> {label}</span></button>
          <div className="concept-grid">{group.map(c => <label className="concept" key={c.id}><input type="checkbox" aria-label={`${c.position} ${c.label} (${c.keys})`} checked={selected.includes(c.id)} onChange={() => update(selected.includes(c.id) ? selected.filter(id => id !== c.id) : [...selected, c.id])}/><span>{c.label}</span><code>{c.keys}</code></label>)}</div>
        </fieldset>;
      })}
    </div>}
    {filter.focus && <div className="legacy-focus small">Focus: {conceptLabel(filter.focus)} <button type="button" className="text-button" onClick={() => onChange({ ...filter, focus: '' })}>Clear</button></div>}
  </div>;
}

export function FilterControls({ filter, learned, onChange, lengths = true }: { filter: Filter; learned: string[]; onChange: (filter: Filter) => void; lengths?: boolean }) {
  return <>
    <div className="filter-controls">
      <label>Words<select aria-label="Words" value={filter.pool} onChange={e => onChange({ ...filter, pool: e.target.value as Filter['pool'] })}><option value="common">Common</option><option value="all">Dictionary</option></select></label>
      {lengths && <label>Word length<div className="length-range"><input aria-label="Minimum word length" type="number" min="1" max={filter.maxLength} value={filter.minLength} onChange={e => onChange({ ...filter, minLength: Math.max(1, Math.min(filter.maxLength, Number(e.target.value) || 1)) })}/><span>to</span><input aria-label="Maximum word length" type="number" min={filter.minLength} max="100" value={filter.maxLength} onChange={e => onChange({ ...filter, maxLength: Math.max(filter.minLength, Math.min(100, Number(e.target.value) || filter.minLength)) })}/></div></label>}
    </div>
    <ConceptPicker filter={filter} learned={learned} onChange={onChange}/>
  </>;
}

export function StenoKeyboard({ outline = '' }: { outline?: string }) {
  const stroke = parseStroke(outline);
  const pressed = new Set<string>();
  if (stroke) {
    [...stroke.initial].forEach(k => pressed.add(`left-${k}`));
    [...stroke.final].forEach(k => pressed.add(`right-${k}`));
    [...stroke.vowel].forEach(k => pressed.add(k));
    if (stroke.star) pressed.add('*');
  }
  const key = (label: string, id: string) => <span key={id} className={`steno-key ${pressed.has(id) ? 'pressed' : ''}`}>{label}</span>;
  return <div className="steno-keyboard" role="img" aria-label={outline ? `Steno keys for ${outline}` : 'Steno keyboard'}>
    <div className="key-row"><div className="key-bank initial-keys">{['S','T','P','H'].map(k => key(k, `left-${k}`))}</div>{key('*', '*')}<div className="key-bank">{['F','P','L','T','D'].map(k => key(k, `right-${k}`))}</div></div>
    <div className="key-row"><div className="key-bank initial-keys">{['S','K','W','R'].map(k => key(k, `left-${k}`))}</div>{key('*', '*')}<div className="key-bank">{['R','B','G','S','Z'].map(k => key(k, `right-${k}`))}</div></div>
    <div className="key-row vowels"><div className="key-bank vowel-bank">{['A','O'].map(k => key(k, k))}</div><div className="key-bank vowel-bank">{['E','U'].map(k => key(k, k))}</div></div>
  </div>;
}

export function downloadFile(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
