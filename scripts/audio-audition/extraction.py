"""Extract a whole phonetic stem from a longer utterance in the same voice.

The recognizer finds the source phones before boundaries are searched. No
phonemes are assembled from separate recordings. A cropped result must pass
both acoustic recognition and signal checks independently.
"""
import numpy as np
import generate as base
import candidates
import time
from phonetics import matches, REVISION
from quality import measure, trim_boundary_silence

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

def find_clip(prepared, phones, recognizer, spans=None):
    spans = recognizer.detailed(prepared) if spans is None else spans
    observed = [s['phone'] for s in spans]
    for first in range(len(spans)):
        for last in range(first + 1, min(len(spans), first + len(phones.split()) + 3) + 1):
            if not matches(phones, observed[first:last]):
                continue
            starts = [0] if first == 0 else np.linspace(spans[first - 1]['end'], spans[first]['start'], 7)[1:-1]
            if first > 0:
                # A CTC emission is evidence for a phone, not an acoustic
                # boundary. Search past it too; otherwise a preceding vowel
                # can leak into a cropped nasal or other voiced onset.
                onset_end = min(spans[first + 1]['start'] if first + 1 < len(spans) else len(prepared) / 24000,
                                spans[first]['end'] + .08)
                starts = list(starts) + list(np.arange(spans[first]['start'], onset_end, .01))
            ends = [len(prepared) / 24000] if last == len(spans) else np.linspace(spans[last - 1]['end'], spans[last]['start'], 7)[1:-1][::-1]
            if last < len(spans):
                # CTC spikes locate evidence, not the end of a consonant.
                # Also try its coarticulatory release, independently rejecting
                # any crop that retains the following vowel/word.
                release = min(len(prepared) / 24000, spans[last]['end'] + .02)
                ends = list(ends) + list(np.arange(spans[last]['start'], release, .01))
            for start in starts:
                for end in ends:
                    a, b = max(0, round(start * 24000)), min(len(prepared), round(end * 24000))
                    if b - a < 1920:
                        continue
                    clip = prepared[a:b].copy()
                    fade = min(120, len(clip) // 4)
                    if a:
                        clip[:fade] *= np.linspace(0, 1, fade)
                        clip = np.concatenate([np.zeros(1920, dtype='float32'), clip])
                    if b < len(prepared):
                        clip[-fade:] *= np.linspace(1, 0, fade)
                        clip = np.concatenate([clip, np.zeros(1920, dtype='float32')])
                    clip = trim_boundary_silence(clip)
                    clip = base.prepare_audio(clip, 24000, trim=False)
                    quality = measure(clip)
                    if quality['issues']:
                        continue
                    actual = recognizer.predict(clip)
                    if matches(phones, actual):
                        return clip, {'version': VERSION, 'sourceStart': a, 'sourceEnd': b,
                            'sourcePhones': observed, 'actual': actual, 'quality': quality, 'revision': REVISION}
    return None

def generate(model, voice, item, reference, recognizer, recipe_hash):
    result = None
    def validate(audio, rate):
        nonlocal result
        import soundfile as sf
        prepared = base.prepare_audio(audio, rate)
        spans = recognizer.detailed(prepared)
        result = find_clip(prepared, item.get('spokenPhones', item['phones']), recognizer, spans)
        # Preserve rejected sources as well: a recognizer rejection needs
        # inspectable evidence, rather than another blind generation retry.
        directory = base.WORK / 'production/review-sources' / base.digest(item['id'].encode())[:20]
        directory.mkdir(parents=True, exist_ok=True)
        name = base.digest(prepared.tobytes())[:20]
        sf.write(directory / (name + '.wav'), prepared, 24000, subtype='PCM_24')
        base.write_json(directory / (name + '.json'), {'target': item['id'], 'text': text, 'recipeHash': recipe_hash,
            'spans': spans, 'matched': result is not None})
        if result is None:
            print('Source phones: ' + ' '.join(s['phone'] for s in spans), flush=True)
        return {'matched': result is not None, 'extraction': result[1] if result else None}
    sources = item['extractFrom'] if isinstance(item['extractFrom'], list) else [item['extractFrom']]
    start = time.perf_counter()
    history = []
    import json
    import soundfile as sf
    directory = base.WORK / 'production/review-sources' / base.digest(item['id'].encode())[:20]
    for path in sorted(directory.glob('*.json')):
        metadata = json.loads(path.read_text())
        if metadata.get('target') != item['id'] or metadata.get('recipeHash') != recipe_hash or metadata.get('text') not in sources or not metadata.get('spans'):
            continue
        prepared, rate = sf.read(path.with_suffix('.wav'), dtype='float32')
        found = find_clip(prepared, item.get('spokenPhones', item['phones']), recognizer, metadata['spans'])
        if found:
            found[1]['sourceText'] = metadata['text']
            return prepared, rate, found[0], time.perf_counter() - start, [{'reusedSourceSha256': base.digest(path.with_suffix('.wav').read_bytes())}], found[1]
    for text in sources:
        try:
            raw, rate, seconds, attempts = candidates.generate_single(model, voice, text, None, reference, validate)
        except ValueError as error:
            history.append({'sourceText': text, 'error': str(error)})
            continue
        if result is not None:
            result[1]['sourceText'] = text
            return raw, rate, result[0], time.perf_counter() - start, history + attempts, result[1]
    raise ValueError('No verified extraction from ' + ', '.join(sources))
