"""Pinned English acoustic screening, independent of expected spelling."""
import json
from pathlib import Path

REPOSITORY = 'vitouphy/wav2vec2-xls-r-300m-timit-phoneme'
REVISION = 'efb7ae9b88f13db0d42eac8cedbba19739e2a278'
PHONES = dict(zip(
    'AA AE AH AO AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z ZH'.split(),
    'ɑ æ ə ɑ aʊ aɪ b ʧ d ð ɛ ɝ eɪ f g h ɪ i ʤ k l m n ŋ oʊ ɔɪ p ɹ s ʃ t θ ʊ u v w j z ʒ'.split()))
VOWELS = set('ɑ æ ə aʊ aɪ ɛ ɝ eɪ ɪ i oʊ ɔɪ ʊ u'.split())

def normalize(phones):
    """Allow narrow allophones, never general vowel or voicing substitutions."""
    out = []
    for phone in phones:
        # A sustained phone can produce separate CTC spikes around a blank.
        if out and out[-1] == phone:
            continue
        # English aspiration after a voiceless stop is not a second /h/.
        if phone == 'h' and out and out[-1] in ('p', 't', 'k'):
            continue
        # The recognizer sometimes splits a rhotic vowel into vowel + ER.
        if phone == 'ɝ' and out and out[-1] in VOWELS:
            phone = 'ɹ'
        out.append(phone)
    for i in range(len(out) - 1):
        # Near vowels before R and affrication of TR/DR in American English.
        if out[i + 1] == 'ɹ':
            out[i] = {'i': 'ɪ', 'ʧ': 't', 'ʤ': 'd'}.get(out[i], out[i])
        # American pre-velar raising in words such as wing.
        if out[i + 1] == 'ŋ' and out[i] == 'i':
            out[i] = 'ɪ'
    # The /aʊ/ offglide can be transcribed separately before dark L (owl).
    out = [p for i, p in enumerate(out) if not (p == 'w' and i > 0 and i + 1 < len(out) and out[i - 1] == 'aʊ' and out[i + 1] == 'l')]
    # A transition vowel before dark L is optional, including file/guile.
    out = [p for i, p in enumerate(out) if not (p == 'ə' and i > 0 and i + 1 < len(out) and out[i - 1] in VOWELS and out[i + 1] == 'l')]
    return out

def expected(phones):
    return [PHONES[p] for p in phones.split()]

def matches(phones, actual):
    return normalize(expected(phones)) == normalize(actual)

class Recognizer:
    def __init__(self):
        from huggingface_hub import snapshot_download
        import torch
        from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
        torch.set_num_threads(2)
        path = Path(snapshot_download(REPOSITORY, revision=REVISION, allow_patterns=['*.json', 'model.safetensors'], max_workers=2))
        self.processor = Wav2Vec2FeatureExtractor.from_pretrained(path)
        self.model = Wav2Vec2ForCTC.from_pretrained(path).eval()
        self.vocabulary = {v: k for k, v in json.loads((path / 'vocab.json').read_text()).items()}

    def predict(self, audio, rate=24000):
        return [p['phone'] for p in self.detailed(audio, rate)]

    def detailed(self, audio, rate=24000):
        import torch
        from scipy.signal import resample_poly
        from math import gcd
        divisor = gcd(rate, 16000)
        inputs = self.processor(resample_poly(audio, 16000 // divisor, rate // divisor), sampling_rate=16000, return_tensors='pt')
        with torch.no_grad():
            ids = self.model(inputs.input_values).logits[0].argmax(-1)
        result = []
        previous = None
        for frame, value in enumerate(ids.tolist()):
            phone = self.vocabulary[value]
            if value != previous:
                if value != self.model.config.pad_token_id and phone not in ('|', ' ') and not phone.startswith('['):
                    result.append({'phone': phone, 'start': (frame * 320 + 200) / 16000, 'end': (frame * 320 + 200) / 16000})
            elif result and value != self.model.config.pad_token_id and result[-1]['phone'] == phone:
                result[-1]['end'] = (frame * 320 + 200) / 16000
            previous = value
        return result
