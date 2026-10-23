"""Check whether encoding preserves the source's acoustic phone evidence.

Greedy label changes alone are not failures: near-tied labels can flip after
small waveform changes. A changed phone path may lose at most 0.25 nats per
phone relative to the lossless source. This is a screening rule, not a claim
that recognition certifies pronunciation.
"""
import json
import numpy as np
import generate as base
from phonetics import Recognizer, REVISION, normalize

MAX_DELTA = .25
BITRATES = [10000, 16000, 24000, 32000, 48000, 64000]

class CodecReview:
    def __init__(self, recognizer=None, cache_path=None):
        self.recognizer = recognizer or Recognizer()
        self.cache_path = cache_path or base.WORK / 'production/codec-references.json'
        saved = json.loads(self.cache_path.read_text()) if self.cache_path.exists() else {}
        self.cache = saved.get('results', {}) if saved.get('revision') == REVISION else {}

    def logits(self, audio):
        import torch
        from scipy.signal import resample_poly
        r = self.recognizer
        data = r.processor(resample_poly(audio, 2, 3), sampling_rate=16000, return_tensors='pt')
        with torch.no_grad():
            return r.model(data.input_values).logits[0].log_softmax(-1)

    def phones(self, probabilities):
        import torch
        r = self.recognizer
        return [i for i in torch.unique_consecutive(probabilities.argmax(-1)).tolist()
                if i != r.model.config.pad_token_id and r.vocabulary[i] not in ('|', ' ')
                and not r.vocabulary[i].startswith('[')]

    def loss(self, probabilities, path):
        import torch
        from torch.nn.functional import ctc_loss
        return float(ctc_loss(probabilities[:, None, :], torch.tensor(path),
            torch.tensor([len(probabilities)]), torch.tensor([len(path)]),
            blank=self.recognizer.model.config.pad_token_id, reduction='sum'))

    def reference(self, audio, sha):
        if sha not in self.cache:
            p = self.logits(audio)
            path = self.phones(p)
            if not path:
                raise ValueError('No acoustic phones in source recording')
            self.cache[sha] = {'path': path, 'phones': [self.recognizer.vocabulary[i] for i in path], 'loss': self.loss(p, path)}
        return self.cache[sha]

    def compare(self, audio, reference):
        p = self.logits(audio)
        phones = [self.recognizer.vocabulary[i] for i in self.phones(p)]
        delta = (self.loss(p, reference['path']) - reference['loss']) / len(reference['path'])
        equal = normalize(phones) == normalize(reference['phones'])
        return {'sourcePhones': reference['phones'], 'decodedPhones': phones,
                'perPhoneLossIncrease': round(delta, 6), 'samePhones': equal,
                'passed': bool(np.isfinite(delta) and (equal or delta <= MAX_DELTA))}

    def save(self):
        base.write_json(self.cache_path, {'revision': REVISION, 'results': self.cache})
