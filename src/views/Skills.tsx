import { concepts, starterSkills } from '../domain/concepts';
import { eligibleWords } from '../domain/vocabulary';
import { useApp } from '../context';
import { SelectionActions } from '../components';

export function SkillsView() {
  const { profile, setProfile, words, dictionary } = useApp();
  const toggle = (id: string) => setProfile(p => ({ ...p, learned: p.learned.includes(id) ? p.learned.filter(c => c !== id) : [...p.learned, id] }));
  const eligible = eligibleWords(words, profile, { ...profile.filter, focus: '', concepts: { mode: 'personal', selected: [] } }).length;
  const banks = [
    ['initial', 'Initial sounds'], ['vowel', 'Vowels'], ['final', 'Final sounds'],
    ['special', 'Special rules'], ['brief', 'Briefs'],
  ];
  return <>
    <div className="skills-overview"><span className="muted small">{profile.learned.length} learned · {eligible.toLocaleString()} words ready</span><div className="skills-actions" role="group" aria-label="All skills"><button className="secondary small" onClick={() => setProfile(p => ({ ...p, learned: [...starterSkills] }))}>Use starter</button><SelectionActions selected={profile.learned.length} total={concepts.length} onSelectAll={() => setProfile(p => ({ ...p, learned: concepts.map(c => c.id) }))} onClear={() => setProfile(p => ({ ...p, learned: [] }))}/></div></div>
    {banks.map(([bank, title]) => {
      const group = concepts.filter(c => c.bank === bank);
      const selected = group.filter(c => profile.learned.includes(c.id)).length;
      return <fieldset className="card skill-section" key={bank} aria-label={title}>
      <legend><span>{title} <span className="muted small">{selected}/{group.length}</span></span><SelectionActions selected={selected} total={group.length} onSelectAll={() => setProfile(p => ({ ...p, learned: [...new Set([...p.learned, ...group.map(c => c.id)])] }))} onClear={() => setProfile(p => ({ ...p, learned: p.learned.filter(id => !group.some(c => c.id === id)) }))}/></legend>
      <div className="concept-grid">{group.map(c => <label className={`concept ${profile.learned.includes(c.id) ? 'learned' : ''}`} key={c.id} title={`${c.description}${dictionary.conceptExamples?.[c.id] ? ` Example: ${dictionary.conceptExamples[c.id].word} (${dictionary.conceptExamples[c.id].outline}).` : ''}`}>
        <input type="checkbox" aria-label={`${c.position} ${c.label} (${c.keys})`} checked={profile.learned.includes(c.id)} onChange={() => toggle(c.id)}/><span className="concept-name">{c.label}</span><code>{c.keys}</code>
      </label>)}</div>
    </fieldset>;
    })}
  </>;
}
