"""Pack validated masters without loading a speech model."""
import argparse
import json
import subprocess
import numpy as np
import soundfile as sf
import generate as base

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
    manifest = {'version': 1, 'sampleRate': 24000, 'voice': 'Clear instructor', 'words': catalog['words'], 'common': catalog['common'],
                'catalogSha256': base.digest(catalog_bytes), 'recipeHash': record_file['recipeHash'], 'sprites': [], 'clips': [], 'fallback': []}
    packs = WORK / 'packs'
    packs.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    prepared = []
    for item in catalog['variants']:
        record = records.get(item['id'])
        expected_spec = base.digest(json.dumps({'recipe': record_file['recipeHash'], 'id': item['id'], 'text': item['text']}, sort_keys=True).encode())
        if record and record.get('spec') != expected_spec:
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
        prepared.append((item, audio))
    files = {}
    def encode(items):
        samples = np.concatenate([audio for _, audio in items])
        source = packs / 'input.wav'
        target = packs / 'output.opus'
        sf.write(source, samples, 24000, subtype='PCM_24')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-map_metadata','-1','-c:a','libopus','-b:a','10k','-vbr','on','-application','audio','-compression_level','10','-frame_duration','20','-fflags','+bitexact',str(target)],check=True)
        content = target.read_bytes()
        if len(content) > 48000:
            if len(items) == 1:
                raise ValueError('Single clip exceeds sprite limit')
            return False
        decoded = np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-ar','24000','-ac','1','-f','f32le','-']),dtype='<f4')
        if len(decoded) != len(samples) or not np.isfinite(decoded).all():
            raise ValueError('Decoded sprite boundaries do not match source')
        sha = base.digest(content)
        files[sha + '.opus'] = content
        sprite = len(manifest['sprites'])
        manifest['sprites'].append({'url': '/audio/instructor/' + sha + '.opus', 'sha256': sha, 'bytes': len(content), 'samples': len(samples)})
        offset = 0
        for item, audio in items:
            if np.max(np.abs(decoded[offset:offset+len(audio)])) < .005:
                raise ValueError('Silent encoded clip: ' + item['id'])
            manifest['clips'].append({'word': item['word'], 'phones': item['phones'], 'outlines': item['outlines'], 'sprite': sprite, 'start': offset, 'end': offset + len(audio)})
            offset += len(audio)
        return True
    start = 0
    while start < len(prepared):
        end, length = start, 0
        while end < len(prepared) and prepared[end][0]['common'] == prepared[start][0]['common'] and length + len(prepared[end][1]) <= 960000:
            length += len(prepared[end][1]); end += 1
        if end == start:
            raise ValueError('Single clip exceeds duration limit')
        while not encode(prepared[start:end]):
            end -= 1
        start = end
    provenance = {'voice': 'Clear instructor', 'syntheticReference': 'data/audio/instructor-reference.wav', 'recipe': record_file['recipe'], 'recipeHash': record_file['recipeHash'],
                  'catalogSha256': base.digest(catalog_bytes), 'dictionarySha256': catalog['dictionarySha256'], 'words': catalog['words'], 'common': catalog['common'],
                  'recordedWords': len(set(c['word'] for c in manifest['clips'])), 'recordedVariants': len(manifest['clips']), 'fallback': manifest['fallback'],
                  'sprites': len(manifest['sprites']), 'audioBytes': sum(s['bytes'] for s in manifest['sprites']), 'generationSeconds': round(sum(r.get('generationSeconds',0) for r in records.values()),2),
                  'encoding': {'codec': 'libopus', 'bitrate': 10000, 'vbr': 'on', 'application': 'audio', 'frameMilliseconds': 20, 'complexity': 10, 'bitexactContainer': True, 'maximumBytes': 48000, 'maximumSamples': 960000,
                               'encoder': subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0]}}
    manifest_bytes = (json.dumps(manifest,separators=(',',':')) + '\n').encode()
    manifest_name = 'catalog.' + base.digest(manifest_bytes) + '.json'
    files[manifest_name] = manifest_bytes
    for name, content in files.items():
        (PUBLIC / name).write_bytes(content)
    base.write_json(ROOT / 'data/audio/published.json', {'manifest': '/audio/instructor/' + manifest_name})
    base.write_json(ROOT / 'data/audio/provenance.json', provenance)
    for path in PUBLIC.iterdir():
        if path.name not in files and path.suffix in ('.json','.opus'):
            path.unlink()
    print(json.dumps({key: provenance[key] for key in ['recordedWords','recordedVariants','sprites','audioBytes','generationSeconds','fallback']},indent=2))

if __name__ == '__main__':
    main()
