import unittest
from phonetics import matches

class PronunciationTests(unittest.TestCase):
    def test_rejects_observed_vowel_errors(self):
        for expected, actual in [
            ('T AY Z', ['t', 'i', 'z']),
            ('D AY Z', ['d', 'i', 'z']),
            ('HH AE T', ['h', 'ɑ', 't']),
            ('OW N D', ['aʊ', 'n', 'd']),
            ('L AY S', ['l', 'ɪ', 's']),
        ]:
            with self.subTest(expected=expected):
                self.assertFalse(matches(expected, actual))

    def test_preserves_consonant_and_vowel_contrasts(self):
        self.assertFalse(matches('DH AE N', ['ð', 'ɛ', 'n']))
        self.assertFalse(matches('G R OW TH', ['g', 'ɹ', 'oʊ', 's']))
        self.assertFalse(matches('B IH N', ['p', 'ɪ', 'n']))

    def test_allows_narrow_american_allophones(self):
        self.assertTrue(matches('P AY L', ['p', 'h', 'aɪ', 'ə', 'l']))
        self.assertTrue(matches('T R EY L D', ['ʧ', 'ɹ', 'eɪ', 'l', 'd']))
        self.assertTrue(matches('D R UW L', ['ʤ', 'ɹ', 'u', 'l']))
        self.assertTrue(matches('HH IY R', ['h', 'ɪ', 'ɝ']))
        self.assertTrue(matches('W IH NG', ['w', 'i', 'ŋ']))
        self.assertTrue(matches('AW L', ['aʊ', 'w', 'l']))
        self.assertTrue(matches('CH IH L D', ['ʧ', 'ʧ', 'ɪ', 'l', 'd']))
        self.assertFalse(matches('N AH L', ['n', 'oʊ', 'l']))
        self.assertFalse(matches('T AY Z', ['t', 'i', 'z']))

if __name__ == '__main__':
    unittest.main()
