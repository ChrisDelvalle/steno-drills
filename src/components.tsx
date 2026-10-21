import type { ReactNode } from 'react';
import { PlayIcon, CheckCircleIcon, BookOpenIcon, DocumentTextIcon, Cog6ToothIcon, ArrowRightIcon, ArrowLeftIcon, PlusIcon, ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { concepts } from './domain/concepts';
import { parseStroke } from './domain/classifier';
import type { Filter } from './domain/types';

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const icons = {
    practice: PlayIcon, skills: CheckCircleIcon, words: BookOpenIcon,
    exercises: DocumentTextIcon, settings: Cog6ToothIcon, arrow: ArrowRightIcon,
    back: ArrowLeftIcon, plus: PlusIcon, download: ArrowDownTrayIcon, refresh: ArrowPathIcon,
  };
  const Component = icons[name as keyof typeof icons] || BookOpenIcon;
  return <Component width={size} height={size} aria-hidden="true"/>;
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty"><p>{title}</p><p>{children}</p></div>;
}
export function FilterControls({ filter, onChange, lengths = true }: { filter: Filter; onChange: (filter: Filter) => void; lengths?: boolean }) {
  return <div className="filter-controls">
    <label>Word pool<select value={filter.pool} onChange={e => onChange({ ...filter, pool: e.target.value as Filter['pool'] })}><option value="common">Common words</option><option value="all">Entire dictionary</option></select></label>
    <label>Focus on a concept<select value={filter.focus} onChange={e => onChange({ ...filter, focus: e.target.value })}><option value="">Everything I know</option>{['initial', 'vowel', 'final', 'special', 'brief'].map(bank => <optgroup label={bank} key={bank}>{concepts.filter(c => c.bank === bank).map(c => <option value={c.id} key={c.id}>{c.label} · {c.keys}</option>)}</optgroup>)}</select></label>
    {lengths && <label>Word length<div className="length-range"><input aria-label="Minimum word length" type="number" min="1" max={filter.maxLength} value={filter.minLength} onChange={e => onChange({ ...filter, minLength: Math.max(1, Math.min(filter.maxLength, Number(e.target.value) || 1)) })}/><span>to</span><input aria-label="Maximum word length" type="number" min={filter.minLength} max="100" value={filter.maxLength} onChange={e => onChange({ ...filter, maxLength: Math.max(filter.minLength, Math.min(100, Number(e.target.value) || filter.minLength)) })}/></div></label>}
  </div>;
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
    <div className="key-row">{['S','T','P','H'].map(k => key(k, `left-${k}`))}{key('*', '*')}{['F','P','L','T','D'].map(k => key(k, `right-${k}`))}</div>
    <div className="key-row">{['S','K','W','R'].map(k => key(k, `left-${k}`))}{key('*', '*')}{['R','B','G','S','Z'].map(k => key(k, `right-${k}`))}</div>
    <div className="key-row vowels">{['A','O','E','U'].map(k => key(k, k))}</div>
  </div>;
}

export function downloadFile(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
