"""Optional local phoneme-recognition review. Does not approve or alter recordings."""
import argparse
import json
import os
import time
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import generate as base

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', default='ae45363bf3413b374fecd9dc8bc1df0e24c3b7f4')
    parser.add_argument('--word', action='append')
    args = parser.parse_args()
    from huggingface_hub import HfApi, snapshot_download
    import torch
    from transformers import Wav2Vec2ForCTC, Wav2Vec2PhonemeCTCTokenizer, Wav2Vec2FeatureExtractor
    torch.set_num_threads(2)
    repository = 'facebook/wav2vec2-lv-60-espeak-cv-ft'
    revision = args.revision or HfApi().model_info(repository).sha
    print('Review model revision: ' + revision, flush=True)
    path = snapshot_download(repository, revision=revision, allow_patterns=['*.json','*.safetensors','pytorch_model.bin'], max_workers=2)
    tokenizer = Wav2Vec2PhonemeCTCTokenizer.from_pretrained(path, do_phonemize=False)
    processor = Wav2Vec2FeatureExtractor.from_pretrained(path)
    model = Wav2Vec2ForCTC.from_pretrained(path).eval()
    work = base.WORK / 'production'
    records = json.loads((work / 'records.json').read_text())['records']
    output_path = work / 'phoneme-review.json'
    old = json.loads(output_path.read_text()) if output_path.exists() else {}
    results = old.get('results',{}) if old.get('revision') == revision else {}
    for index, (key,record) in enumerate(records.items()):
        if args.word and key.split('|')[0] not in args.word:
            continue
        if record.get('status') != 'ready' or results.get(key,{}).get('sha256') == record['sha256']:
            continue
        audio, rate = sf.read(base.ROOT / record['path'],dtype='float32')
        audio = resample_poly(audio,2,3)
        inputs = processor(audio,sampling_rate=16000,return_tensors='pt')
        with torch.no_grad():
            ids = model(inputs.input_values).logits.argmax(dim=-1)
        prediction = tokenizer.batch_decode(ids)[0]
        results[key] = {'sha256':record['sha256'],'phones':prediction}
        base.write_json(output_path,{'repository':repository,'revision':revision,'results':results})
        if index % 50 == 0:
            print(f'{index+1}/{len(records)}: {key} -> {prediction}',flush=True)
    print(f'Reviewed {len(results)} recordings',flush=True)

if __name__ == '__main__':
    main()
