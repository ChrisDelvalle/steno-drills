import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import torch
from codec import CodecReview

class StubReview(CodecReview):
    def __init__(self, cache):
        recognizer = SimpleNamespace(vocabulary={0:'n',1:'ə',2:'l',3:'oʊ',4:'[PAD]'}, model=SimpleNamespace(config=SimpleNamespace(pad_token_id=4)))
        super().__init__(recognizer, cache)
    def logits(self, audio):
        values = torch.full((5,5), -8.)
        for frame, label in enumerate([4,0,1,2,4]):
            values[frame,label] = 8
        if audio[0] == 1:
            values[2,1] = -8; values[2,3] = 8
        elif audio[0] in (2,3):
            values[2,1] = .1 if audio[0] == 2 else 0
            values[2,3] = 0 if audio[0] == 2 else .1
        return values.log_softmax(-1)

class CodecTests(unittest.TestCase):
    def test_rejects_lost_vowel_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            review = StubReview(Path(directory)/'cache.json')
            reference = review.reference(np.array([0]), 'reference')
            self.assertTrue(review.compare(np.array([0]), reference)['passed'])
            altered = review.compare(np.array([1]), reference)
            self.assertFalse(altered['passed'])
            self.assertGreater(altered['perPhoneLossIncrease'], .25)
    def test_does_not_treat_a_near_tied_argmax_flip_as_a_pronunciation_error(self):
        with tempfile.TemporaryDirectory() as directory:
            review = StubReview(Path(directory)/'cache.json')
            reference = review.reference(np.array([2]), 'reference')
            result = review.compare(np.array([3]), reference)
            self.assertFalse(result['samePhones'])
            self.assertTrue(result['passed'])
            self.assertLess(result['perPhoneLossIncrease'], .25)
