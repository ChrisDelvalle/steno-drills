import { useState } from 'react';
import { useApp } from '../context';
import { wordDrills } from '../domain/exercises';

const general = [
  ['bank', 'Words', 'Dictionary'], ['chords', 'Keys / chords', 'Keyboard'], ['fingers', 'Dueling Digit Duo', 'Finger drills'],
  ['sentences', 'Sentences', 'Text'], ['two-key', 'Two-key sentences', 'Text'], ['quotes', 'Quotes', 'Text'],
  ['numbers', 'Numbers', 'Numbers'], ['number-sentences', 'Number sentences', 'Numbers'], ['symbols', 'Symbols', 'Emily’s Symbols'], ['text', 'Custom text', 'Text'],
];
const library = [...general.map(([id, label, group]) => ({ id, label, group })), ...wordDrills.map(d => ({ id: `drill:${d.id}`, label: d.label, group: d.group }))];
export function ExerciseLibrary() {
  const { goPractice } = useApp();
  const [query, setQuery] = useState('');
  const shown = library.filter(d => `${d.label} ${d.group}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <div className="exercise-library">
    <div className="table-toolbar"><label className="search-field"><span className="sr-only">Search exercises</span><input type="search" placeholder="Search exercises…" value={query} onChange={e => setQuery(e.target.value)}/></label><span className="small muted">{shown.length} exercises</span></div>
    <div className="table-scroll"><table><thead><tr><th>Exercise</th><th>Type</th><th><span className="sr-only">Choose</span></th></tr></thead><tbody>{shown.map(d => <tr key={d.id}><td>{d.label}</td><td className="muted">{d.group}</td><td><button className="text-button" aria-label={`Choose ${d.label}`} onClick={() => goPractice(d.id)}>Choose</button></td></tr>)}</tbody></table></div>
    {!shown.length && <p className="empty">No matches.</p>}
  </div>;
}
