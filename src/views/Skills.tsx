import { concepts, starterSkills } from '../domain/concepts';
import { eligibleWords } from '../domain/vocabulary';
import { useApp } from '../context';

export function SkillsView() {
  const { profile, setProfile, words } = useApp();
  const toggle = (id: string) => setProfile(p => ({ ...p, learned: p.learned.includes(id) ? p.learned.filter(c => c !== id) : [...p.learned, id] }));
  const eligible = eligibleWords(words, profile, { ...profile.filter, focus: '' }).length;
  const banks = [
    ['initial', 'Initial sounds'], ['vowel', 'Vowels'], ['final', 'Final sounds'],
    ['special', 'Special rules'], ['brief', 'Briefs'],
  ];
  return <>
    <div className="skills-overview"><span className="muted small">{profile.learned.length} learned · {eligible.toLocaleString()} words ready</span><button className="secondary small" onClick={() => setProfile(p => ({ ...p, learned: [...starterSkills] }))}>Use my starter preset</button></div>
    {banks.map(([bank, title]) => <fieldset className="card skill-section" key={bank}>
      <legend>{title} <span className="muted small">{concepts.filter(c => c.bank === bank && profile.learned.includes(c.id)).length}/{concepts.filter(c => c.bank === bank).length}</span></legend>
      <div className="concept-grid">{concepts.filter(c => c.bank === bank).map(c => <label className={`concept ${profile.learned.includes(c.id) ? 'learned' : ''}`} key={c.id} title={c.description}>
        <input type="checkbox" aria-label={`${c.position} ${c.label} (${c.keys})`} checked={profile.learned.includes(c.id)} onChange={() => toggle(c.id)}/><span className="concept-name">{c.label}</span><code>{c.keys}</code>
      </label>)}</div>
    </fieldset>)}
  </>;
}
