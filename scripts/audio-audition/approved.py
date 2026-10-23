"""Preserve complete, checksum-bound recordings accepted in listening review."""
import json
import re
import subprocess
import numpy as np
import soundfile as sf
import generate as base
from quality import measure
from phonetics import REVISION, matches


def policy_hash():
    return base.digest((base.ROOT / 'scripts/audio-audition/codec.py').read_bytes() +
                       (base.ROOT / 'scripts/audio-audition/phonetics.py').read_bytes())


def checked_path(relative, directory, sha):
    path = (base.ROOT / relative).resolve()
    if not path.is_relative_to((base.ROOT / directory).resolve()) or not re.fullmatch('[a-f0-9]{64}', sha) or base.digest(path.read_bytes()) != sha:
        raise ValueError('Approved recording checksum or path mismatch')
    return path


def load(item, recipe_hash):
    spec = item['reviewedRecording']
    metadata = checked_path(spec['metadata'], 'data/audio/repairs', spec['sha256'])
    data = json.loads(metadata.read_text())
    if data.get('version') != 2 or data.get('target') != item['id'] or data.get('recipeHash') != recipe_hash:
        raise ValueError('Approved recording target or recipe mismatch')
    path = checked_path(data['source'], 'data/audio/repairs', data['sourceSha256'])
    source, rate = sf.read(path, dtype='float32')
    if rate != 24000 or source.ndim != 1 or len(source) != data['samples'] or base.digest(source.tobytes()) != data['sampleSha256'] or measure(source)['issues']:
        raise ValueError('Invalid approved recording samples')
    approval = data['approval']
    batch = json.loads(checked_path(approval['file'], 'data/audio/repairs', approval['sha256']).read_text())
    vote = next((r for r in batch['approved'] if r['id'] == approval['id'] and r['sha256'] == data['sampleSha256']), None)
    if batch.get('version') != 1 or not vote or vote.get('rating') != 'good' or vote.get('word') != item['word'] or not (approval['id'] == item['id'] or approval['id'].startswith(item['id'] + ':')):
        raise ValueError('Missing matching listening approval')
    asset = data['asset']
    if not re.fullmatch(r'/audio/instructor/[a-f0-9]{64}\.(opus|flac)', asset['url']) or asset['url'].split('/')[-1].split('.')[0] != asset['sha256']:
        raise ValueError('Invalid approved asset URL')
    path = checked_path('public' + asset['url'], 'public/audio/instructor', asset['sha256'])
    content = path.read_bytes()
    if not 0 < len(content) == asset['bytes'] <= 48000 or asset['samples'] != len(source) or len(source) > 960000:
        raise ValueError('Invalid approved asset bounds')
    decoded = np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar','24000','-ac','1','-f','f32le','-']), dtype='<f4')
    if decoded.shape != source.shape or base.digest(decoded.tobytes()) != data['assetSampleSha256'] or measure(decoded)['issues']:
        raise ValueError('Approved asset samples changed')
    evidence = data['assetReview']
    result = evidence['result']
    if evidence['policySha256'] != policy_hash() or evidence['recognizerRevision'] != REVISION or result.get('passed') is not True or not np.isfinite(result.get('perPhoneLossIncrease', float('nan'))) or (not result.get('samePhones') and result['perPhoneLossIncrease'] > .25):
        raise ValueError('Stale or failed approved asset review')
    if asset['url'].endswith('.opus') and result.get('samePhones') is not True:
        raise ValueError('Approved Opus asset lost a phone')
    if asset['url'].endswith('.flac') and np.max(np.abs(decoded - source)) > 2 ** -24:
        raise ValueError('Approved lossless conversion changed the recording')
    return source, decoded, data, content


def append(manifest, quality, item, data, record):
    asset = data['asset']
    sprite = next((i for i,s in enumerate(manifest['sprites']) if s['sha256'] == asset['sha256']), None)
    if sprite is None:
        sprite = len(manifest['sprites']); manifest['sprites'].append(asset)
    manifest['clips'].append({'word': item['word'], 'phones': item['phones'], 'outlines': item['outlines'],
        'sprite': sprite, 'start': 0, 'end': data['samples'],
        **({'preferred': True} if item.get('preferred') else {}),
        **({'spokenPhones': item['spokenPhones']} if item.get('spokenPhones') else {})})
    acoustic = dict(data['assetReview']['result'])
    acoustic['dictionaryPhonesMatched'] = matches(item.get('spokenPhones', item['phones']), acoustic['sourcePhones'])
    acoustic['reviewedRecording'] = item['reviewedRecording']
    acoustic['humanApproved'] = True
    if item.get('requirePhoneMatch'): acoustic['requiresPhoneMatch'] = True
    if record['sha256'] != data['sourceSha256']:
        raise ValueError('Approved generation changed its source')
    quality[item['id']] = {**data['assetReview']['signal'], 'sha256': data['assetSampleSha256'],
                           'sourceSha256': record['sha256'], 'acoustic': acoustic}
