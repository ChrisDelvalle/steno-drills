"""Screen the actual packed recordings against outline-specific dictionary phones.

Recognition is evidence for review, not a pronunciation certificate. The model
never sees the expected word. Results are cached by decoded clip checksum.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
import numpy as np
from scipy.signal import resample_poly
import generate as base
from phonetics import normalize, matches

REPOSITORY = 'vitouphy/wav2vec2-xls-r-300m-timit-phoneme'
REVISION = 'efb7ae9b88f13db0d42eac8cedbba19739e2a278'
# This English recognizer merges the cot/caught vowels and stressed/unstressed
# central vowels. Keep other vowel contrasts, especially AY/IY, distinct.
PHONES = dict(zip(
    'AA AE AH AO AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z ZH'.split(),
    'ɑ æ ə ɑ aʊ aɪ b ʧ d ð ɛ ɝ eɪ f g h ɪ i ʤ k l m n ŋ oʊ ɔɪ p ɹ s ʃ t θ ʊ u v w j z ʒ'.split()))
VOWELS = set('ɑ æ ə aʊ aɪ ɛ ɝ eɪ ɪ i oʊ ɔɪ ʊ u'.split())

def distance(a, b):
    row = list(range(len(b) + 1))
    for i, x in enumerate(a):
        next_row = [i + 1]
        for j, y in enumerate(b):
            next_row.append(min(row[j + 1] + 1, next_row[-1] + 1, row[j] + (x != y)))
        row = next_row
    return row[-1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--word', action='append')
    parser.add_argument('--transcribe-flagged', action='store_true')
    parser.add_argument('--transcriber', choices=['small', 'tiny'], default='small')
    args = parser.parse_args()
    from huggingface_hub import snapshot_download
    import torch
    from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
    torch.set_num_threads(2)
    path = Path(snapshot_download(REPOSITORY, revision=REVISION, allow_patterns=['*.json', 'model.safetensors'], max_workers=2))
    processor = Wav2Vec2FeatureExtractor.from_pretrained(path)
    model = Wav2Vec2ForCTC.from_pretrained(path).eval()
    vocabulary = {v: k for k, v in json.loads((path / 'vocab.json').read_text()).items()}
    published = json.loads((base.ROOT / 'data/audio/published.json').read_text())
    manifest_path = base.ROOT / ('public' + published['manifest'])
    manifest = json.loads(manifest_path.read_text())
    catalog = json.loads((base.ROOT / 'data/audio/catalog.json').read_text())
    work = base.WORK / 'production'
    report_path = work / 'pronunciation-audit.json'
    old = json.loads(report_path.read_text()) if report_path.exists() else {}
    cache = old.get('results', {}) if old.get('revision') == REVISION else {}
    quality_path = base.ROOT / 'data/audio/quality.json'
    quality = json.loads(quality_path.read_text()) if quality_path.exists() else {}
    reviewed = quality.get('results', {}) if quality.get('manifest') == published['manifest'] and quality.get('recognizerRevision') == REVISION else {}
    results = {}
    pcm = {}
    for index, clip in enumerate(manifest['clips']):
        if args.word and clip['word'] not in args.word:
            continue
        sprite = manifest['sprites'][clip['sprite']]
        if clip['sprite'] not in pcm:
            pcm = {clip['sprite']: np.frombuffer(subprocess.check_output([
                'ffmpeg', '-v', 'error', '-i', str(base.ROOT / ('public' + sprite['url'])),
                '-ar', '24000', '-ac', '1', '-f', 'f32le', '-']), dtype='<f4')}
            if len(pcm[clip['sprite']]) != sprite['samples']:
                raise ValueError('Decoded sprite length mismatch')
        audio = pcm[clip['sprite']][clip['start']:clip['end']]
        key = clip['word'] + '|' + clip['phones']
        sha = hashlib.sha256(audio.tobytes()).hexdigest()
        record = cache.get(key)
        if not record or record.get('sha256') != sha:
            evidence = reviewed.get(key, {})
            if evidence.get('sha256') == sha and evidence.get('acoustic', {}).get('decodedPhones'):
                actual = evidence['acoustic']['decodedPhones']
            else:
                inputs = processor(resample_poly(audio, 2, 3), sampling_rate=16000, return_tensors='pt')
                with torch.no_grad():
                    logits = model(inputs.input_values).logits[0]
                ids = logits.argmax(-1)
                actual = [vocabulary[i] for i in torch.unique_consecutive(ids).tolist()
                          if i != model.config.pad_token_id and vocabulary[i] not in ('|', ' ') and not vocabulary[i].startswith('[')]
            expected = [PHONES[p] for p in clip.get('spokenPhones', clip['phones']).split()]
            record = {'sha256': sha, 'expected': expected, 'actual': actual,
                      'distance': distance(expected, actual),
                      'vowelMismatch': [p for p in expected if p in VOWELS] != [p for p in actual if p in VOWELS]}
        results[key] = record
        record['matched'] = matches(clip.get('spokenPhones', clip['phones']), record['actual'])
        cache[key] = record
        if index % 50 == 0:
            base.write_json(report_path, {'repository': REPOSITORY, 'revision': REVISION,
                'manifest': published['manifest'], 'results': cache})
        if index % 100 == 0:
            print(f'{index + 1}/{len(manifest["clips"])}: {key} => {" ".join(record["actual"])}', flush=True)
    base.write_json(report_path, {'repository': REPOSITORY, 'revision': REVISION,
        'manifest': published['manifest'], 'results': cache})
    del model
    if args.transcribe_flagged:
        from transformers import WhisperProcessor, WhisperForConditionalGeneration
        repository, revision = {
            'small': ('openai/whisper-small.en', 'e8727524f962ee844a7319d92be39ac1bd25655a'),
            'tiny': ('openai/whisper-tiny.en', '87c7102498dcde7456f24cfd30239ca606ed9063'),
        }[args.transcriber]
        path = snapshot_download(repository, revision=revision, allow_patterns=['*.json', '*.txt', 'model.safetensors'], max_workers=2)
        processor = WhisperProcessor.from_pretrained(path)
        model = WhisperForConditionalGeneration.from_pretrained(path).eval()
        for index, clip in enumerate(manifest['clips']):
            key = clip['word'] + '|' + clip['phones']
            record = results.get(key)
            if not record or record['matched'] or record.get('transcriptRevision') == revision:
                continue
            sprite = manifest['sprites'][clip['sprite']]
            if clip['sprite'] not in pcm:
                pcm = {clip['sprite']: np.frombuffer(subprocess.check_output([
                    'ffmpeg', '-v', 'error', '-i', str(base.ROOT / ('public' + sprite['url'])),
                    '-ar', '24000', '-ac', '1', '-f', 'f32le', '-']), dtype='<f4')}
            audio = pcm[clip['sprite']][clip['start']:clip['end']]
            inputs = processor(resample_poly(audio, 2, 3), sampling_rate=16000, return_tensors='pt')
            with torch.no_grad():
                ids = model.generate(inputs.input_features, max_new_tokens=20)
            record.update(transcript=processor.batch_decode(ids, skip_special_tokens=True)[0].strip(), transcriptRevision=revision)
            base.write_json(report_path, {'repository': REPOSITORY, 'revision': REVISION,
                'manifest': published['manifest'], 'results': cache})
            print(f'{key} => {record["transcript"]}', flush=True)
    summary = {'recordings': len(results), 'exact': sum(not r['distance'] for r in results.values()),
        'matched': sum(r['matched'] for r in results.values()),
        'flagged': sum(not r['matched'] for r in results.values()),
        'vowelFlags': sum(r['vowelMismatch'] for r in results.values()),
        'coverage': len(results) == len(manifest['clips']), 'fallback': len(manifest['fallback']),
        'catalogVariants': len(catalog['variants'])}
    print(json.dumps(summary), flush=True)

if __name__ == '__main__':
    main()
