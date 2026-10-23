"""Resumable production masters. Never accesses Plover's personal files."""
import argparse
import json
import time
from pathlib import Path
import numpy as np
import soundfile as sf
import candidates
import generate as base
from phonetics import Recognizer, matches, REVISION
from quality import measure, trim_boundary_silence, VERSION

ROOT = base.ROOT
WORK = base.WORK / 'production'
CATALOG = ROOT / 'data/audio/catalog.json'
REFERENCE = ROOT / 'data/audio/instructor-reference.wav'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--word', action='append')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--retry-fallbacks', action='store_true')
    parser.add_argument('--repair-audit', action='store_true')
    parser.add_argument('--repair-unverified', action='store_true')
    parser.add_argument('--repair-quality', action='store_true')
    parser.add_argument('--verify-phonemes', action='store_true')
    parser.add_argument('--reviewed-only', action='store_true')
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
    old = json.loads(candidates.RECORDS.read_text()) if candidates.RECORDS.exists() else {}
    ambiguous = {v['word'] for v in catalog['variants'] if v['note']}
    model = None
    voice = next(v for v in candidates.CONFIG['voices'] if v['id'] == 'instructor')
    start = time.perf_counter()
    selected = [v for v in catalog['variants'] if not args.word or v['word'] in args.word]
    if args.reviewed_only:
        selected = [v for v in selected if v.get('reviewedRecording')]
    recognizer = None
    reviewing = args.repair_audit or args.repair_unverified or args.repair_quality or args.verify_phonemes
    if reviewing:
        if args.repair_audit:
            audit = json.loads((WORK / 'pronunciation-audit.json').read_text())
            if audit['revision'] != REVISION:
                raise ValueError('Audit model revision mismatch')
            if audit.get('manifest') != json.loads((ROOT / 'data/audio/published.json').read_text())['manifest']:
                raise ValueError('Audit is stale; screen the published collection first')
            selected = [v for v in selected if v['id'] in audit['results'] and not matches(v.get('spokenPhones', v['phones']), audit['results'][v['id']]['actual'])]
        elif args.repair_unverified:
            selected = [v for v in selected if records.get(v['id'], {}).get('status') != 'ready']
        elif args.repair_quality:
            selected = [v for v in selected if records.get(v['id'], {}).get('status') == 'ready' and measure(sf.read(ROOT / records[v['id']]['path'], dtype='float32')[0])['issues']]
        recognizer = Recognizer()
    for index, item in enumerate(selected):
        key = base.digest(item['id'].encode())[:20]
        spec = base.production_spec(recipe_hash, item)
        spoken_phones = item.get('spokenPhones', item['phones'])
        cached = records.get(item['id'])
        if item.get('fallback'):
            records[item['id']] = {'spec': spec, 'status': 'fallback', 'reason': item['fallback']}
            continue
        master = WORK / 'masters' / f'{key}-{spec[:16]}.wav'
        ready = WORK / 'prepared' / f'{key}-{spec[:16]}.wav'
        if cached and cached.get('spec') == spec and cached.get('status') == 'ready':
            master = ROOT / cached.get('master', str((WORK / 'masters' / f'{key}.wav').relative_to(ROOT)))
            ready = ROOT / cached['path']
        if reviewing:
            master = WORK / 'masters' / f'{key}-{spec[:16]}-review-{REVISION[:8]}-signal-{VERSION}.wav'
            ready = WORK / 'prepared' / f'{key}-{spec[:16]}-review-{REVISION[:8]}-signal-{VERSION}.wav'
        if not args.force and not reviewing and cached and cached.get('spec') == spec and cached.get('status') == 'ready' and master.exists() and ready.exists() and base.digest(master.read_bytes()) == cached['masterSha256'] and base.digest(ready.read_bytes()) == cached['sha256']:
            continue
        if not args.force and not reviewing and not args.retry_fallbacks and cached and cached.get('spec') == spec and cached.get('status') in ('fallback', 'needs-review'):
            continue
        try:
            extraction = None
            if recognizer is None and not item.get('reviewedRecording'):
                recognizer = Recognizer()
            reuse = old.get('instructor:' + item['word']) if not reviewing and not item.get('reviewedRecording') and item['text'] == item['word'] and item['word'] not in ambiguous else None
            if reuse:
                audition, audition_rate = sf.read(base.WORK / reuse['master'], dtype='float32')
                candidate = trim_boundary_silence(base.prepare_audio(audition, audition_rate))
                if not matches(spoken_phones, recognizer.predict(candidate)) or measure(candidate)['issues']:
                    reuse = None
            if item.get('reviewedRecording'):
                from extraction import reviewed_clip
                raw, rate, prepared, extraction = reviewed_clip(item, recipe_hash)
                seconds, attempts = 0, [{'reviewedRecording': item['reviewedRecording']}]
            elif reuse and base.digest((base.WORK / reuse['master']).read_bytes()) == reuse['masterSha256']:
                raw, rate = sf.read(base.WORK / reuse['master'], dtype='float32')
                seconds, attempts = 0, [{'reusedAudition': reuse['masterSha256']}]
            else:
                if model is None:
                    from mlx_audio.tts.utils import load_model
                    print('Loading pinned Clear instructor model', flush=True)
                    model = load_model(candidates.snapshot('clone'))
                def validate(audio, rate):
                    prepared = trim_boundary_silence(base.prepare_audio(audio, rate))
                    actual = recognizer.predict(prepared)
                    quality = measure(prepared)
                    result = {'revision': REVISION, 'expected': spoken_phones, 'actual': actual, 'phonemesMatched': matches(spoken_phones, actual), 'quality': quality, 'matched': matches(spoken_phones, actual) and not quality['issues']}
                    directory = WORK / 'review-sources' / key
                    directory.mkdir(parents=True, exist_ok=True)
                    name = base.digest(prepared.tobytes())[:20]
                    sf.write(directory / (name + '.wav'), prepared, 24000, subtype='PCM_24')
                    base.write_json(directory / (name + '.json'), {'target': item['id'], 'text': synthesis_text, **result})
                    if not result['matched']:
                        print('Observed phones: ' + ' '.join(actual), flush=True)
                    return result
                # Legacy context fields describe old cached sources, not a
                # license to cut another word until recognition accepts it.
                synthesis_text = item['word'] if item.get('extractFrom') else item['text']
                raw, rate, seconds, attempts = candidates.generate_single(model, voice, synthesis_text, None, REFERENCE, validate if recognizer else None)
            if extraction is None:
                prepared = base.prepare_audio(raw, rate)
            if extraction is None:
                prepared = trim_boundary_silence(prepared)
            if not .1 < len(prepared) / 24000 < 2.5 or np.max(np.abs(prepared)) > .995:
                raise ValueError('Invalid processed recording')
            master.parent.mkdir(parents=True, exist_ok=True)
            ready.parent.mkdir(parents=True, exist_ok=True)
            if extraction and extraction.get('version') == 2:
                source_bytes = (ROOT / extraction['source']).read_bytes()
                master.write_bytes(source_bytes)
                ready.write_bytes(source_bytes)
            else:
                sf.write(master, raw, rate, subtype='FLOAT')
                sf.write(ready, prepared, 24000, subtype='PCM_24')
            records[item['id']] = {'spec': spec, 'status': 'ready', 'master': str(master.relative_to(ROOT)), 'path': str(ready.relative_to(ROOT)), 'sha256': base.digest(ready.read_bytes()),
                'masterSha256': base.digest(master.read_bytes()), 'samples': len(prepared), 'generationSeconds': round(seconds, 4), 'attempts': attempts, **({'extraction': extraction} if extraction else {})}
        except (ValueError, RuntimeError) as error:
            records[item['id']] = {'spec': spec, 'status': 'needs-review', 'reason': 'Recording needs pronunciation or signal review' if recognizer else str(error), **({'previous': cached} if cached else {})}
            print(f'Needs review: {item["id"]}: {error}', flush=True)
        base.write_json(records_path, {'recipe': recipe, 'recipeHash': recipe_hash, 'records': records})
        if index % 25 == 0 or index == len(selected) - 1:
            print(f'{index + 1}/{len(selected)}; {time.perf_counter() - start:.1f}s; {item["word"]}', flush=True)
    print(json.dumps({'words': catalog['words'], 'variants': len(catalog['variants']), 'ready': sum(r.get('status') == 'ready' for r in records.values()),
        'unverified': sum(r.get('status') != 'ready' for r in records.values()), 'generationSeconds': round(sum(r.get('generationSeconds', 0) for r in records.values()), 2), 'elapsedSeconds': round(time.perf_counter() - start, 2)}), flush=True)

if __name__ == '__main__':
    main()
