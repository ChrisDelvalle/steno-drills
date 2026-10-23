"""Pack masters and verify their decoded signal and acoustic phone evidence."""
import argparse
import json
import subprocess
import numpy as np
import soundfile as sf
import generate as base
from quality import measure, VERSION as QUALITY_VERSION
from codec import CodecReview, BITRATES, MAX_DELTA
from phonetics import REVISION, matches

ROOT = base.ROOT
WORK = base.WORK / 'production'
PUBLIC = ROOT / 'public/audio/instructor'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--partial', action='store_true')
    args = parser.parse_args()
    catalog_bytes = (ROOT / 'data/audio/catalog.json').read_bytes()
    catalog = json.loads(catalog_bytes)
    record_file = json.loads((WORK / 'records.json').read_text())
    records = record_file['records']
    unresolved = [v['id'] for v in catalog['variants'] if records.get(v['id'], {}).get('status') != 'ready']
    if unresolved and not args.partial:
        raise ValueError(f'Full recorded coverage required; {len(unresolved)} pronunciations remain unverified: ' + ', '.join(unresolved[:12]))
    manifest = {'version': 1, 'sampleRate': 24000, 'voice': 'Clear instructor', 'words': catalog['words'], 'common': catalog['common'],
                'catalogSha256': base.digest(catalog_bytes), 'recipeHash': record_file['recipeHash'], 'sprites': [], 'clips': [], 'fallback': []}
    packs = WORK / 'packs'
    packs.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    prepared = []
    approved = []
    for item in catalog['variants']:
        record = records.get(item['id'])
        expected_spec = base.production_spec(record_file['recipeHash'], item)
        if record and record.get('status') == 'ready' and record.get('spec') != expected_spec:
            raise ValueError('Stale recording; run generation: ' + item['id'])
        if not record or record.get('status') != 'ready':
            if not record and not args.partial:
                raise ValueError('Generation incomplete: ' + item['id'])
            manifest['fallback'].append({'id': item['id'], 'reason': record.get('reason', 'Unresolved recording') if record else 'Generation pending'})
            continue
        path = ROOT / record['path']
        if base.digest(path.read_bytes()) != record['sha256']:
            raise ValueError('Master checksum mismatch: ' + item['id'])
        audio, rate = sf.read(path, dtype='float32')
        if rate != 24000 or audio.ndim != 1 or len(audio) != record['samples'] or not np.isfinite(audio).all() or np.max(np.abs(audio)) < .005:
            raise ValueError('Invalid prepared audio: ' + item['id'])
        if item.get('reviewedRecording') and json.loads((ROOT / item['reviewedRecording']['metadata']).read_text()).get('version') == 2:
            from approved import load
            _, _, data, content = load(item, record_file['recipeHash'])
            approved.append((item, data, content))
        else:
            prepared.append((item, audio))
    files = {}
    quality = {}
    review = CodecReview()
    review_policy = base.digest((ROOT / 'scripts/audio-audition/codec.py').read_bytes() + (ROOT / 'scripts/audio-audition/phonetics.py').read_bytes())
    cache_path = WORK / 'packing-review.json'
    saved = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    acoustic_cache = saved.get('results', {}) if saved.get('policy') == review_policy else {}
    references = {item['id']: review.reference(audio, records[item['id']]['sha256']) for item, audio in prepared}
    review.save()
    for item, _ in prepared:
        reference = references[item['id']]
        reference['dictionaryPhonesMatched'] = matches(item.get('spokenPhones', item['phones']), reference['phones'])
        if not reference['dictionaryPhonesMatched']:
            if not item.get('reviewedRecording'):
                raise ValueError('Lossless source needs pronunciation review: ' + item['id'])
            from extraction import reviewed_clip
            _, _, _, evidence = reviewed_clip(item, record_file['recipeHash'])
            reference['reviewedRecording'] = item['reviewedRecording']
    def encode(items, rate_index=0):
        lossless = rate_index == len(BITRATES)
        bitrate = None if lossless else BITRATES[rate_index]
        samples = np.concatenate([audio for _, audio in items])
        source = packs / 'input.wav'
        extension = 'flac' if lossless else 'opus'
        target = packs / ('output.' + extension)
        sf.write(source, samples, 24000, subtype='PCM_24')
        options = ['-c:a','flac','-compression_level','12'] if lossless else ['-c:a','libopus','-b:a',str(bitrate),'-vbr','on','-application','audio','-compression_level','10','-frame_duration','20']
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-map_metadata','-1',*options,'-fflags','+bitexact',str(target)],check=True)
        content = target.read_bytes()
        if len(content) > 48000:
            if len(items) == 1:
                raise ValueError('Single clip exceeds sprite limit')
            middle = len(items) // 2
            encode(items[:middle], rate_index)
            encode(items[middle:], rate_index)
            return
        decoded = np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-ar','24000','-ac','1','-f','f32le','-']),dtype='<f4')
        if len(decoded) != len(samples) or not np.isfinite(decoded).all():
            raise ValueError('Decoded sprite boundaries do not match source')
        offset = 0
        checked = []
        for item, audio in items:
            clip_audio = decoded[offset:offset + len(audio)]
            signal = measure(clip_audio)
            key = base.digest(clip_audio.tobytes()) + ':' + records[item['id']]['sha256']
            if key not in acoustic_cache:
                acoustic_cache[key] = review.compare(clip_audio, references[item['id']])
            acoustic = dict(acoustic_cache[key])
            if item.get('requirePhoneMatch'):
                acoustic['requiresPhoneMatch'] = True
                acoustic['passed'] = acoustic['passed'] and acoustic['samePhones']
            acoustic['dictionaryPhonesMatched'] = references[item['id']]['dictionaryPhonesMatched']
            if references[item['id']].get('reviewedRecording'):
                acoustic['reviewedRecording'] = references[item['id']]['reviewedRecording']
            checked.append((item, audio, clip_audio, signal, acoustic))
            offset += len(audio)
            # One failure already requires a new encoding. Avoid re-running
            # the model on the rest of a pack that cannot be published.
            if (signal['issues'] or not acoustic['passed']) and not lossless:
                break
        base.write_json(cache_path, {'policy': review_policy, 'results': acoustic_cache})
        failed = [item['id'] for item, _, _, signal, acoustic in checked if signal['issues'] or not acoustic['passed']]
        if failed and not lossless:
            next_encoding = str(BITRATES[rate_index + 1]) + ' bps' if rate_index + 1 < len(BITRATES) else 'lossless FLAC'
            print(f'Encoding {len(items)} clips at {next_encoding}; acoustic review: ' + ', '.join(failed[:4]), flush=True)
            encode(items, rate_index + 1)
            return
        if failed and not args.partial:
            raise ValueError('Decoded audio needs review: ' + ', '.join(failed))
        sha = base.digest(content)
        files[sha + '.' + extension] = content
        sprite = len(manifest['sprites'])
        manifest['sprites'].append({'url': '/audio/instructor/' + sha + '.' + extension, 'sha256': sha, 'bytes': len(content), 'samples': len(samples), **({'bitrate': bitrate} if bitrate else {})})
        offset = 0
        for item, audio, clip_audio, result, acoustic in checked:
            quality[item['id']] = {**result, 'sha256': base.digest(clip_audio.tobytes()),
                                  'sourceSha256': records[item['id']]['sha256'], 'acoustic': acoustic}
            manifest['clips'].append({'word': item['word'], 'phones': item['phones'], 'outlines': item['outlines'], 'sprite': sprite, 'start': offset, 'end': offset + len(audio),
                **({'preferred': True} if item.get('preferred') else {}),
                **({'spokenPhones': item['spokenPhones']} if item.get('spokenPhones') else {})})
            offset += len(audio)
        print(f'Packed {len(items)} clips · {str(bitrate) + " bps" if bitrate else "lossless FLAC"} · {len(content)} bytes', flush=True)
    start = 0
    while start < len(prepared):
        end, length = start, 0
        while end < len(prepared) and prepared[end][0]['common'] == prepared[start][0]['common'] and length + len(prepared[end][1]) <= 960000:
            length += len(prepared[end][1]); end += 1
        if end == start:
            raise ValueError('Single clip exceeds duration limit')
        encode(prepared[start:end])
        start = end
    from approved import append
    for item, data, content in approved:
        append(manifest, quality, item, data, records[item['id']])
        files[data['asset']['url'].split('/')[-1]] = content
    provenance = {'voice': 'Clear instructor', 'syntheticReference': 'data/audio/instructor-reference.wav', 'recipe': record_file['recipe'], 'recipeHash': record_file['recipeHash'],
                  'catalogSha256': base.digest(catalog_bytes), 'dictionarySha256': catalog['dictionarySha256'], 'words': catalog['words'], 'common': catalog['common'],
                  'recordedWords': len(set(c['word'] for c in manifest['clips'])), 'recordedVariants': len(manifest['clips']), 'fallback': manifest['fallback'],
                  'sprites': len(manifest['sprites']), 'audioBytes': sum(s['bytes'] for s in manifest['sprites']), 'generationSeconds': round(sum(r.get('generationSeconds',0) for r in records.values()),2),
                  'encoding': {'codec': 'libopus', 'losslessFallback': 'FLAC 24-bit', 'minimumBitrate': 10000, 'adaptiveBitrates': BITRATES, 'maximumPerPhoneLossIncrease': MAX_DELTA, 'vbr': 'on', 'application': 'audio', 'frameMilliseconds': 20, 'complexity': 10, 'bitexactContainer': True, 'maximumBytes': 48000, 'maximumSamples': 960000,
                               'encoder': subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0]}}
    manifest_bytes = (json.dumps(manifest,separators=(',',':')) + '\n').encode()
    manifest_name = 'catalog.' + base.digest(manifest_bytes) + '.json'
    files[manifest_name] = manifest_bytes
    for name, content in files.items():
        (PUBLIC / name).write_bytes(content)
    base.write_json(ROOT / 'data/audio/published.json', {'manifest': '/audio/instructor/' + manifest_name})
    base.write_json(ROOT / 'data/audio/provenance.json', provenance)
    base.write_json(ROOT / 'data/audio/quality.json', {'version': QUALITY_VERSION,
        'policySha256': base.digest((ROOT / 'scripts/audio-audition/quality.py').read_bytes()),
        'acousticPolicySha256': base.digest((ROOT / 'scripts/audio-audition/codec.py').read_bytes() + (ROOT / 'scripts/audio-audition/phonetics.py').read_bytes()),
        'recognizerRevision': REVISION, 'maximumPerPhoneLossIncrease': MAX_DELTA,
        'manifest': '/audio/instructor/' + manifest_name, 'results': quality})
    for path in PUBLIC.iterdir():
        if path.name not in files and path.suffix in ('.json','.opus','.flac'):
            path.unlink()
    print(json.dumps({key: provenance[key] for key in ['recordedWords','recordedVariants','sprites','audioBytes','generationSeconds','fallback']},indent=2))

if __name__ == '__main__':
    main()
