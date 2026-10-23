"""Resumable production masters. Never accesses Plover's personal files."""
import argparse
import json
import time
from pathlib import Path
import numpy as np
import soundfile as sf
import candidates
import generate as base

ROOT = base.ROOT
WORK = base.WORK / 'production'
CATALOG = ROOT / 'data/audio/catalog.json'
REFERENCE = ROOT / 'data/audio/instructor-reference.wav'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--word')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--retry-fallbacks', action='store_true')
    args = parser.parse_args()
    catalog = json.loads(CATALOG.read_text())
    reference_hash = base.digest(REFERENCE.read_bytes())
    if reference_hash != 'd1d800f1cac528c93060ab577670e39b56876c73b08df05ab6ea8ea4e4102ce9':
        raise ValueError('Approved reference checksum mismatch')
    recipe = {'version': 1, 'model': candidates.CONFIG['models']['clone'], 'referenceSha256': reference_hash,
              'referenceText': candidates.CONFIG['referenceText'], 'processing': base.CONFIG['processing'],
              'temperatures': [.5, .3, .1, 0], 'topP': .8, 'topK': 20, 'maxTokens': 64, 'seed': base.CONFIG['seed'], 'packages': base.versions()}
    recipe_hash = candidates.fingerprint(recipe)
    WORK.mkdir(parents=True, exist_ok=True)
    records_path = WORK / 'records.json'
    previous = json.loads(records_path.read_text()) if records_path.exists() else {}
    records = previous.get('records', {}) if previous.get('recipeHash') == recipe_hash else {}
    old = json.loads(candidates.RECORDS.read_text())
    ambiguous = {v['word'] for v in catalog['variants'] if v['note']}
    model = None
    voice = next(v for v in candidates.CONFIG['voices'] if v['id'] == 'instructor')
    start = time.perf_counter()
    selected = [v for v in catalog['variants'] if not args.word or v['word'] == args.word]
    for index, item in enumerate(selected):
        key = base.digest(item['id'].encode())[:20]
        spec = candidates.fingerprint({'recipe': recipe_hash, 'id': item['id'], 'text': item['text']})
        cached = records.get(item['id'])
        if item.get('fallback'):
            records[item['id']] = {'spec': spec, 'status': 'fallback', 'reason': item['fallback']}
            continue
        master = WORK / 'masters' / f'{key}-{spec[:16]}.wav'
        ready = WORK / 'prepared' / f'{key}-{spec[:16]}.wav'
        if cached and cached.get('spec') == spec and cached.get('status') == 'ready':
            master = ROOT / cached.get('master', str((WORK / 'masters' / f'{key}.wav').relative_to(ROOT)))
            ready = ROOT / cached['path']
        if not args.force and cached and cached.get('spec') == spec and cached.get('status') == 'ready' and master.exists() and ready.exists() and base.digest(master.read_bytes()) == cached['masterSha256'] and base.digest(ready.read_bytes()) == cached['sha256']:
            continue
        if not args.force and not args.retry_fallbacks and cached and cached.get('spec') == spec and cached.get('status') == 'fallback':
            continue
        try:
            reuse = old.get('instructor:' + item['word']) if item['text'] == item['word'] and item['word'] not in ambiguous else None
            if reuse and base.digest((base.WORK / reuse['master']).read_bytes()) == reuse['masterSha256']:
                raw, rate = sf.read(base.WORK / reuse['master'], dtype='float32')
                seconds, attempts = 0, [{'reusedAudition': reuse['masterSha256']}]
            else:
                if model is None:
                    from mlx_audio.tts.utils import load_model
                    print('Loading pinned Clear instructor model', flush=True)
                    model = load_model(candidates.snapshot('clone'))
                raw, rate, seconds, attempts = candidates.generate_single(model, voice, item['text'], None, REFERENCE)
            prepared = base.prepare_audio(raw, rate)
            if not .1 < len(prepared) / 24000 < 2.5 or np.max(np.abs(prepared)) > .995:
                raise ValueError('Invalid processed recording')
            master.parent.mkdir(parents=True, exist_ok=True)
            ready.parent.mkdir(parents=True, exist_ok=True)
            sf.write(master, raw, rate, subtype='FLOAT')
            sf.write(ready, prepared, 24000, subtype='PCM_24')
            records[item['id']] = {'spec': spec, 'status': 'ready', 'master': str(master.relative_to(ROOT)), 'path': str(ready.relative_to(ROOT)), 'sha256': base.digest(ready.read_bytes()),
                'masterSha256': base.digest(master.read_bytes()), 'samples': len(prepared), 'generationSeconds': round(seconds, 4), 'attempts': attempts}
        except (ValueError, RuntimeError) as error:
            records[item['id']] = {'spec': spec, 'status': 'fallback', 'reason': str(error)}
            print(f'Fallback: {item["id"]}: {error}', flush=True)
        base.write_json(records_path, {'recipe': recipe, 'recipeHash': recipe_hash, 'records': records})
        if index % 25 == 0 or index == len(selected) - 1:
            print(f'{index + 1}/{len(selected)}; {time.perf_counter() - start:.1f}s; {item["word"]}', flush=True)
    print(json.dumps({'words': catalog['words'], 'variants': len(catalog['variants']), 'ready': sum(r.get('status') == 'ready' for r in records.values()),
        'fallback': sum(r.get('status') == 'fallback' for r in records.values()), 'generationSeconds': round(sum(r.get('generationSeconds', 0) for r in records.values()), 2), 'elapsedSeconds': round(time.perf_counter() - start, 2)}), flush=True)

if __name__ == '__main__':
    main()
