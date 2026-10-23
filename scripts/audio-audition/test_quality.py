import unittest
import numpy as np
from quality import measure, trim_boundary_silence

class SignalTests(unittest.TestCase):
    def tone(self, seconds, amplitude=.15):
        return (amplitude * np.sin(np.arange(round(seconds * 24000)) * 2 * np.pi * 220 / 24000)).astype('float32')

    def test_accepts_reserved_guards(self):
        audio = np.concatenate([np.zeros(1920), self.tone(.4), np.zeros(1920)])
        self.assertEqual(measure(audio)['issues'], [])

    def test_flags_long_silence_and_gaps(self):
        audio = np.concatenate([np.zeros(7200), self.tone(.2), np.zeros(6000), self.tone(.2)])
        issues = measure(audio)['issues']
        self.assertIn('Excess boundary silence', issues)
        self.assertIn('Internal silence', issues)

    def test_flags_quiet_breathy_tail_without_trimming_it(self):
        audio = np.concatenate([self.tone(.3), self.tone(.4, .0007), np.zeros(1920)])
        before = audio.copy()
        self.assertTrue(any('quiet boundary' in issue for issue in measure(audio)['issues']))
        np.testing.assert_array_equal(audio, before)

    def test_trims_only_excess_near_silence_and_preserves_guards(self):
        speech = self.tone(.3)
        audio = np.concatenate([np.zeros(12000), speech, np.zeros(24000)])
        trimmed = trim_boundary_silence(audio)
        np.testing.assert_array_equal(trimmed[1920:-1920], speech)
        self.assertEqual(measure(trimmed)['issues'], [])

    def test_preserves_quiet_fricatives(self):
        audio = np.concatenate([np.zeros(1920), self.tone(.1, .004), self.tone(.3), self.tone(.15, .004), np.zeros(1920)])
        np.testing.assert_array_equal(trim_boundary_silence(audio), audio)

    def test_accepts_audible_quiet_initial_frication_without_losing_the_onset(self):
        audio = np.concatenate([np.zeros(1920), self.tone(.2, .006), self.tone(.3), np.zeros(1920)])
        self.assertEqual(measure(audio)['issues'], [])
        np.testing.assert_array_equal(trim_boundary_silence(audio), audio)

if __name__ == '__main__':
    unittest.main()
