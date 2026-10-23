"""Signal screening for monosyllabic prompts; never trims speech automatically."""
import argparse
import json
import subprocess
import numpy as np
import generate as base

VERSION = 1

def longest_run(mask):
    longest = run = 0
    for value in mask:
        run = run + 1 if value else 0
        longest = max(longest, run)
    return longest

def measure(audio, rate=24000):
    if not len(audio) or not np.isfinite(audio).all():
        return {'issues': ['Invalid samples']}
    frame = round(rate * .01)
    energy = np.array([np.sqrt(np.mean(audio[i:i + frame] ** 2)) for i in range(0, len(audio), frame)])
    db = 20 * np.log10(np.maximum(energy, 1e-10))
    audible = np.flatnonzero(db > -60)
    prominent = np.flatnonzero(db > max(-45, float(db.max()) - 28))
    duration = len(audio) / rate
    lead = audible[0] * .01 if len(audible) else duration
    tail = max(0, duration - (audible[-1] + 1) * .01) if len(audible) else duration
    quiet_lead = prominent[0] * .01 if len(prominent) else duration
    quiet_tail = max(0, duration - (prominent[-1] + 1) * .01) if len(prominent) else duration
    gap = longest_run(db[audible[0]:audible[-1] + 1] < -60) * .01 if len(audible) else duration
    issues = []
    if lead > .16 or tail > .16:
        issues.append('Excess boundary silence')
    if gap > .18:
        issues.append('Internal silence')
    # Initial F/TH can have ~200 ms of quiet frication plus the 80 ms
    # playback guard. Do not confuse that necessary consonant with silence.
    if quiet_lead > .34 or quiet_tail > .255:
        issues.append('Extended quiet boundary; review for breath or weak consonants')
    if duration > 1.35:
        issues.append('Long single-word recording')
    if np.max(np.abs(audio)) < .005:
        issues.append('Silent recording')
    return {'seconds': round(duration, 4), 'leadingMs': round(lead * 1000), 'trailingMs': round(tail * 1000),
            'quietLeadingMs': round(quiet_lead * 1000), 'quietTrailingMs': round(quiet_tail * 1000),
            'internalSilenceMs': round(gap * 1000), 'issues': issues}

def trim_boundary_silence(audio, rate=24000):
    """Remove only excessive near-silence; retain 80 ms guards and consonants."""
    frame = round(rate * .01)
    energy = np.array([np.sqrt(np.mean(audio[i:i + frame] ** 2)) for i in range(0, len(audio), frame)])
    audible = np.flatnonzero(energy > .001)
    if not len(audible):
        return audio
    first, last = audible[0] * frame, min(len(audio), (audible[-1] + 1) * frame)
    start = max(0, first - round(rate * .08)) if first / rate > .16 else 0
    end = min(len(audio), last + round(rate * .08)) if (len(audio) - last) / rate > .16 else len(audio)
    return audio[start:end].copy() if start or end < len(audio) else audio

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--word', action='append')
    parser.add_argument('--masters', action='store_true')
    args = parser.parse_args()
    results = {}
    if args.masters:
        import soundfile as sf
        records = json.loads((base.WORK / 'production/records.json').read_text())['records']
        for key, record in records.items():
            if record.get('status') != 'ready' or args.word and key.split('|')[0] not in args.word:
                continue
            audio, rate = sf.read(base.ROOT / record['path'], dtype='float32')
            results[key] = {**measure(audio, rate), 'sha256': record['sha256']}
    else:
        published = json.loads((base.ROOT / 'data/audio/published.json').read_text())
        manifest = json.loads((base.ROOT / ('public' + published['manifest'])).read_text())
        pcm = {}
        for clip in manifest['clips']:
            if args.word and clip['word'] not in args.word:
                continue
            sprite = manifest['sprites'][clip['sprite']]
            if clip['sprite'] not in pcm:
                pcm = {clip['sprite']: np.frombuffer(subprocess.check_output([
                    'ffmpeg', '-v', 'error', '-i', str(base.ROOT / ('public' + sprite['url'])),
                    '-ar', '24000', '-ac', '1', '-f', 'f32le', '-']), dtype='<f4')}
            audio = pcm[clip['sprite']][clip['start']:clip['end']]
            results[clip['word'] + '|' + clip['phones']] = {**measure(audio), 'sha256': base.digest(audio.tobytes())}
    output = base.WORK / ('production/quality-masters.json' if args.masters else 'production/quality-packed.json')
    base.write_json(output, {'version': VERSION, 'results': results})
    flagged = {k: r for k, r in results.items() if r['issues']}
    print(json.dumps({'reviewed': len(results), 'flagged': len(flagged), 'report': str(output), 'examples': dict(list(flagged.items())[:12])}, indent=2))

if __name__ == '__main__':
    main()
