import json
import unittest
import generate as base
from extraction import reviewed_clip

class ReviewedExtractionTests(unittest.TestCase):
    def setUp(self):
        self.metadata = json.loads((base.ROOT / 'data/audio/repairs/null.json').read_text())
        self.spec = {'metadata': 'data/audio/repairs/null.json', 'sha256': base.digest((base.ROOT / 'data/audio/repairs/null.json').read_bytes())}
        self.item = {'id': 'null|N AH L', 'reviewedRecording': self.spec}

    def test_reproduces_whole_stem_and_preserves_review_evidence(self):
        _, rate, clip, data = reviewed_clip(self.item, self.metadata['recipeHash'])
        self.assertEqual(rate, 24000)
        self.assertEqual(len(clip), 9780)
        self.assertEqual(base.digest(clip.tobytes()), self.metadata['sampleSha256'])
        self.assertEqual(data['review']['transcript'], 'Null')

    def test_rejects_changed_input_recipe_or_target(self):
        with self.assertRaises(ValueError):
            reviewed_clip(self.item, 'wrong-recipe')
        with self.assertRaises(ValueError):
            reviewed_clip({**self.item, 'id': 'no|N OW'}, self.metadata['recipeHash'])
        with self.assertRaises(ValueError):
            reviewed_clip({**self.item, 'reviewedRecording': {**self.spec, 'sha256': '0' * 64}}, self.metadata['recipeHash'])
