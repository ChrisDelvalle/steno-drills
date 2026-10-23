"""Reproduce reviewed recordings. Production never searches for word stems."""
import numpy as np
import generate as base
from quality import measure

VERSION = 1

def reviewed_clip(item, recipe_hash):
    """Reproduce a checksum-bound whole-stem repair, preserving its review."""
    import json
    import soundfile as sf
    spec = item['reviewedRecording']
    metadata = (base.ROOT / spec['metadata']).resolve()
    allowed = (base.ROOT / 'data/audio/repairs').resolve()
    if not metadata.is_relative_to(allowed) or base.digest(metadata.read_bytes()) != spec['sha256']:
        raise ValueError('Reviewed recording metadata mismatch')
    data = json.loads(metadata.read_text())
    if data.get('version') == 2:
        from approved import load
        source, _, data, _ = load(item, recipe_hash)
        return source, 24000, source, data
    source = (base.ROOT / data['source']).resolve()
    if data['version'] != VERSION or data['target'] != item['id'] or data['recipeHash'] != recipe_hash or not source.is_relative_to(allowed) or base.digest(source.read_bytes()) != data['sourceSha256']:
        raise ValueError('Reviewed recording source mismatch')
    raw, rate = sf.read(source, dtype='float32')
    a, b = data['sourceStart'], data['sourceEnd']
    if rate != 24000 or raw.ndim != 1 or not 0 <= a < b <= len(raw) or b - a < 1920 or data['fadeSamples'] != 120 or data['guardSamples'] != 1920:
        raise ValueError('Invalid reviewed recording boundaries')
    clip = raw[a:b].copy()
    if a:
        clip[:120] *= np.linspace(0, 1, 120)
        clip = np.r_[np.zeros(1920, dtype='float32'), clip]
    if b < len(raw):
        clip[-120:] *= np.linspace(1, 0, 120)
        clip = np.r_[clip, np.zeros(1920, dtype='float32')]
    clip = base.prepare_audio(clip, rate, trim=False)
    if base.digest(clip.tobytes()) != data['sampleSha256'] or data['review']['transcript'].lower().strip('.!?') != item['id'].split('|')[0]:
        raise ValueError('Reviewed recording output mismatch')
    if measure(clip)['issues']:
        raise ValueError('Reviewed recording failed signal checks')
    return raw, rate, clip, data
