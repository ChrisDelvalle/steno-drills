import type { Bank, Concept } from './types';

type Row = [id: string, label: string, keys: string, phones: string, starter?: boolean];
const rules = (position: Concept['position'], rows: Row[], bank: Bank = position): Concept[] => rows.map(
  ([id, label, keys, phones, starter = false]) => ({
    id: `${bank}.${id}`, label, keys, position, bank, starter,
    phones: phones.split('|'),
    description: position === 'brief' ? `Memorized outline for “${label}”.` : `${position} ${label}: ${keys}; sounds ${phones.replaceAll('|', ' or ')}.`,
  }),
);

export const concepts: Concept[] = [
  ...rules('initial', [
    ['s', 'S', 'S', 'S', true], ['t', 'T', 'T', 'T', true], ['k', 'K / hard C', 'K', 'K', true],
    ['p', 'P', 'P', 'P', true], ['w', 'W', 'W', 'W', true], ['h', 'H', 'H', 'HH', true], ['r', 'R', 'R', 'R', true],
    ['d', 'D', 'TK', 'D', true], ['b', 'B', 'PW', 'B', true], ['l', 'L', 'HR', 'L', true],
    ['f', 'F', 'TP', 'F', true], ['m', 'M', 'PH', 'M', true], ['n', 'N', 'TPH', 'N', true],
    ['j', 'J / soft G', 'SKWR', 'JH', true], ['g', 'G', 'TKPW', 'G', true],
    ['v', 'V', 'SR', 'V'], ['y', 'Y', 'KWR', 'Y'], ['z', 'Z', 'STKPW', 'Z'],
    ['qu', 'QU', 'KW', 'K W'], ['sh', 'SH', 'SH', 'SH'], ['ch', 'CH', 'KH', 'CH'],
    ['th', 'TH (thin)', 'TH', 'TH'], ['th-voiced', 'TH (then)', 'TH', 'DH'],
    ['st', 'ST', 'ST', 'S T'], ['sp', 'SP', 'SP', 'S P'], ['sk', 'SK', 'SK', 'S K'],
    ['br', 'BR', 'PWR', 'B R'], ['fr', 'FR', 'TPR', 'F R'], ['gr', 'GR', 'TKPWR', 'G R'],
    ['pl', 'PL', 'PHR', 'P L'], ['bl', 'BL', 'PWHR', 'B L'], ['sl', 'SL', 'SHR', 'S L'],
    ['tr', 'TR', 'TR', 'T R'], ['dr', 'DR', 'TKR', 'D R'], ['fl', 'FL', 'TPHR', 'F L'],
  ]),
  ...rules('vowel', [
    ['a', 'Short A', 'A', 'AE|AA', true], ['o', 'Short O', 'O', 'AA|AO|AH', true],
    ['e', 'Short E', 'E', 'EH', true], ['u', 'Short U', 'U', 'AH|UH', true],
    ['short-i', 'Short I', 'EU', 'IH', true], ['long-a', 'Long A', 'AEU', 'EY', true],
    ['long-e', 'Long E', 'AOE', 'IY', true], ['long-i', 'Long I', 'AOEU', 'AY', true],
    ['long-o', 'Long O', 'OE', 'OW'], ['long-u', 'Long U', 'AOU', 'UW'],
    ['aw', 'AW', 'AU', 'AO'], ['ow', 'OW', 'OU', 'AW'], ['oy', 'OY', 'OEU', 'OY'],
    ['oo', 'OO', 'AO', 'UH|UW'], ['ae', 'AE disambiguator', 'AE', 'AE|EH'],
  ]),
  ...rules('final', [
    ['f', 'F', '-F', 'F', true], ['r', 'R', '-R', 'R', true], ['p', 'P', '-P', 'P', true],
    ['b', 'B', '-B', 'B', true], ['l', 'L', '-L', 'L', true], ['g', 'G', '-G', 'G', true],
    ['t', 'T', '-T', 'T', true], ['s', 'S', '-S', 'S', true], ['d', 'D', '-D', 'D', true], ['z', 'Z', '-Z', 'Z', true],
    ['m', 'M', '-PL', 'M', true], ['n', 'N', '-PB', 'N', true], ['k', 'K', '-BG', 'K', true], ['j', 'J', '-PBLG', 'JH', true],
    ['sh', 'SH', '-RB', 'SH'], ['ch', 'CH', '-FP', 'CH'], ['ng', 'NG', '-PBG', 'NG'],
    ['nk', 'NK', '-PBG', 'NG K'], ['ld', 'LD', '-LD', 'L D'], ['lt', 'LT', '-LT', 'L T'],
    ['rt', 'RT', '-RT', 'R T'], ['nt', 'NT', '-PBT', 'N T'], ['nd', 'ND', '-PBD', 'N D'],
    ['mp', 'MP', '-FRP', 'M P'], ['ft', 'FT', '-FT', 'F T'],
  ]),
  ...rules('final', [
    ['final-v', 'Final V using -F', '-F', 'V'],
    ['final-st', 'Final ST using -FT', '-FT', 'S T'],
    ['final-st-f', 'Final ST using -F', '-F', 'S T'],
    ['final-z-s', 'Voiced S using -S', '-S', 'Z'],
    ['final-th', 'Final TH using *T', '*T', 'TH'],
    ['final-th-voiced', 'Final TH (voiced)', '*T', 'DH'],
  ], 'special'),
  ...rules('brief', [
    ['the', 'the', '-T', ''], ['of', 'of', '-F', ''], ['to', 'to', 'TO', ''],
    ['in', 'in', 'TPH', ''], ['a', 'a', 'AEU', ''], ['is', 'is', 'S', ''],
    ['that', 'that', 'THA', ''], ['with', 'with', 'W', ''], ['be', 'be', '-B', ''],
    ['by', 'by', 'PWEU', ''], ['he', 'he', 'E', ''],
  ]),
];
export const conceptMap = new Map(concepts.map(c => [c.id, c]));
export const starterSkills = concepts.filter(c => c.starter).map(c => c.id);
export const singleKeySkills = concepts.filter(c => !['special', 'brief'].includes(c.bank) && c.keys.replace('-', '').length === 1).map(c => c.id);
export const conceptBanks = [
  ['initial', 'Initials'], ['vowel', 'Vowels'], ['final', 'Finals'],
  ['special', 'Rules'], ['brief', 'Briefs'],
] as const;
export const conceptLabel = (id: string) => {
  const c = conceptMap.get(id);
  return c ? `${c.bank === 'special' ? '' : `${c.bank} `}${c.label}` : id;
};
