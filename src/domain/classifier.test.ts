import { describe, expect, it } from 'vitest';
import { analyzeOutline, makeEntry, parseStroke } from './classifier';
import { starterSkills } from './concepts';
import { eligibleWords, evaluate } from './vocabulary';
import { defaultProfile } from './profile';

describe('sound-aware Plover filtering', () => {
  it.each([
    ['bad', 'PWAD', 'B AE1 D'], ['dim', 'TKEUPL', 'D IH1 M'], ['name', 'TPHAEUPL', 'N EY1 M'],
    ['feet', 'TPAOET', 'F IY1 T'], ['like', 'HRAOEUBG', 'L AY1 K'], ['judge', 'SKWRUPBLG', 'JH AH1 JH'],
  ])('admits starter word %s with its explained outline', (word, outline, pronunciation) => {
    expect(evaluate(makeEntry(word, [outline], [pronunciation.split(' ')]), starterSkills)).toMatchObject({ eligible: true, outline });
  });
  it('does not infer D from separately learned T and K', () => {
    const entry = makeEntry('dim', ['TKEUPL'], [['D', 'IH1', 'M']]);
    expect(evaluate(entry, starterSkills.filter(c => c !== 'initial.d'))).toMatchObject({ eligible: false, missing: ['initial.d'] });
  });
  it('keeps final F, V and ST as separate rules', () => {
    const jive = makeEntry('jive', ['SKWRAOEUF'], [['JH', 'AY1', 'V']]);
    const just = makeEntry('just', ['SKWRUF'], [['JH', 'AH1', 'S', 'T']]);
    expect(evaluate(jive, starterSkills).missing).toEqual(['special.final-v']);
    expect(evaluate(just, starterSkills).missing).toEqual(['special.final-st-f']);
    expect(evaluate(jive, [...starterSkills, 'special.final-v']).eligible).toBe(true);
  });
  it('unlocks briefs explicitly, and rejects compressed multisyllables', () => {
    const the = makeEntry('the', ['-T'], [['DH', 'AH0']]);
    expect(evaluate(the, starterSkills).missing).toEqual(['brief.the']);
    expect(evaluate(the, [...starterSkills, 'brief.the']).eligible).toBe(true);
    expect(evaluate(makeEntry('tablet', ['TABLT'], [['T', 'AE1', 'B', 'L', 'AH0', 'T']]), starterSkills).reason).toBe('More than one syllable');
  });
  it('retains alternatives, and keeps the hint consistent with the focus filter', () => {
    const word = makeEntry('sea', ['SAOE', 'SAE'], [['S', 'IY1']]);
    word.outlines.push({ outline: 'SE', requirements: [['vowel.e', 'initial.s']] });
    expect(evaluate(word, starterSkills.filter(c => c !== 'vowel.long-e')).outline).toBe('SE');
    const profile = defaultProfile();
    expect(eligibleWords([word], profile, { ...profile.filter, pool: 'all', focus: 'vowel.long-e' })[0].outline).toBe('SAOE');
  });
  it('keeps unknown and conflicting syllable counts out of automatic practice', () => {
    expect(evaluate(makeEntry('unknownword', ['KAT'], []), starterSkills).reason).toBe('Syllable count unknown');
    expect(evaluate(makeEntry('fire', ['TPAOEUR'], [['F', 'AY1', 'R'], ['F', 'AY1', 'ER0']]), starterSkills).reason).toBe('Conflicting syllable counts');
  });
  it('does not admit unexplained asterisks or malformed steno', () => {
    expect(analyzeOutline('bad', 'PWA*D', [['B', 'AE1', 'D']]).requirements).toEqual([]);
    for (const s of ['', '-', 'BAD', 'KTA', 'T-A', 'T/PH', 'PL']) expect(parseStroke(s)).toBeNull();
    expect(parseStroke('-T')?.final).toBe('T');
    expect(parseStroke('T-T')?.initial).toBe('T');
  });
});
