"""Local, resumable auditions. No app data or Plover files are modified."""
import argparse
from functools import cache
import gc
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / ".audio-audition"
PUBLIC = WORK / "public"
CONFIG = json.loads(Path(__file__).with_name("config.json").read_text())
os.environ.setdefault("HF_HOME", str(WORK / "huggingface"))
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def snapshot(model_id):
    from huggingface_hub import snapshot_download

    model = CONFIG["models"][model_id]
    patterns = ["*.json", "*.safetensors", "*.txt", "*.md", "speech_tokenizer/*"]
    if model_id == "kokoro":
        patterns = ["config.json", "kokoro-v1_0.safetensors", "README.md", "voices/af_heart.safetensors", "voices/am_michael.safetensors"]
    return Path(snapshot_download(repo_id=model["repository"], revision=model["revision"], allow_patterns=patterns, max_workers=3))


def clip_info(path, duration):
    return {"url": "/" + str(path.relative_to(PUBLIC)), "bytes": path.stat().st_size, "duration": round(duration, 6), "sha256": digest(path.read_bytes())}


def manifest(records):
    clips, timings = {}, {}
    sizes = {"original": 0, **{str(rate): 0 for rate in CONFIG["encoding"]["bitrates"]}}
    ready = 0
    for voice in CONFIG["voices"]:
        clips[voice["id"]] = {}
        timing = 0
        for word in CONFIG["words"]:
            record = records.get(f'{voice["id"]}:{word}')
            if not record or record["spec"] != generation_spec(voice, word) or record.get("processing") != processing_spec():
                continue
            files = record.get("clips", {})
            if len(files) != len(sizes) or not all((PUBLIC / f["url"].lstrip("/")).is_file() for f in files.values()):
                continue
            clips[voice["id"]][word] = files
            ready += 1
            timing += record["generationSeconds"]
            for quality, file in files.items():
                sizes[quality] += file["bytes"]
        timings[voice["id"]] = round(timing, 2)
    value = {"version": 1, "voices": CONFIG["voices"], "words": CONFIG["words"], "notes": {"read": "ambiguous", "lead": "ambiguous", "wind": "ambiguous", "live": "ambiguous"}, "clips": clips, "ready": ready, "total": len(CONFIG["voices"]) * len(CONFIG["words"]), "complete": ready == len(CONFIG["voices"]) * len(CONFIG["words"]), "report": {"generationSeconds": timings, "bytesByQuality": sizes}, "settings": CONFIG, "packages": versions(), "machine": {"platform": platform.platform(), "architecture": platform.machine()}}
    write_json(PUBLIC / "auditions.json", value)
    return value


@cache
def versions():
    return {name: importlib.metadata.version(name) for name in ["mlx-audio", "mlx", "numpy", "soundfile", "misaki", "transformers"]}


def generation_spec(voice, word):
    settings = {"voice": voice, "word": word, "seed": CONFIG["seed"], "speed": CONFIG["generationSpeed"], "model": CONFIG["models"][voice["model"]], "qwen": CONFIG["qwen"] if voice["model"] == "qwen" else None, "packages": versions()}
    return digest(json.dumps(settings, sort_keys=True).encode())


@cache
def processing_spec():
    return digest(json.dumps({"version": 1, "processing": CONFIG["processing"], "encoding": CONFIG["encoding"], "sampleRate": CONFIG["sampleRate"]}, sort_keys=True).encode())


def prepare_audio(raw, sample_rate, trim=True):
    import numpy as np
    from scipy.signal import resample_poly

    data = np.asarray(raw, dtype=np.float32).squeeze()
    if data.ndim == 2:
        data = data.mean(axis=-1)
    if data.ndim != 1 or not len(data) or not np.isfinite(data).all():
        raise ValueError("Empty or non-finite recording")
    target = CONFIG["sampleRate"]
    if sample_rate != target:
        divisor = math.gcd(sample_rate, target)
        data = resample_poly(data, target // divisor, sample_rate // divisor)
    # Keep 80 ms of context around even very quiet consonants. Preserve raw masters.
    settings = CONFIG["processing"]
    audible = np.flatnonzero(np.abs(data) > 10 ** (settings["trimThresholdDb"] / 20))
    if not len(audible):
        raise ValueError("Silent recording")
    guard = round(target * settings["guardMilliseconds"] / 1000)
    reference = data[max(0, int(audible[0]) - guard):min(len(data), int(audible[-1]) + guard + 1)]
    if trim:
        data = reference
    rms = float(np.sqrt(np.mean(reference.astype(np.float64) ** 2)))
    gain = min(10 ** (settings["targetRmsDb"] / 20) / rms, 10 ** (settings["maximumPeakDb"] / 20) / float(np.max(np.abs(reference))))
    return np.asarray(data * gain, dtype=np.float32)


def encode(voice, word, master, trim=True, process=True):
    import soundfile as sf

    raw, rate = sf.read(master, dtype="float32")
    audio = prepare_audio(raw, rate, trim=trim) if process else raw
    if not process and rate != CONFIG["sampleRate"]:
        raise ValueError("Prepared sequences must use the comparison sample rate")
    directory = PUBLIC / "clips" / voice["id"]
    directory.mkdir(parents=True, exist_ok=True)
    original = directory / f"{word}.wav"
    sf.write(original, audio, CONFIG["sampleRate"], subtype="PCM_24")
    duration = len(audio) / CONFIG["sampleRate"]
    files = {"original": clip_info(original, duration)}
    settings = CONFIG["encoding"]
    for bitrate in settings["bitrates"]:
        output = directory / f"{word}.{bitrate}.opus"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(original), "-map_metadata", "-1", "-c:a", "libopus", "-b:a", f"{bitrate}k", "-vbr", settings["vbr"], "-application", settings["application"], "-compression_level", str(settings["complexity"]), "-frame_duration", str(settings["frameDuration"]), str(output)], check=True)
        # Decode each file as an integrity check; encoded duration must match the master.
        result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(output)], check=True, capture_output=True, text=True)
        if abs(float(result.stdout) - duration) > .05:
            raise ValueError(f"Unexpected encoded duration: {output}")
        files[str(bitrate)] = clip_info(output, duration)
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=["all", "kokoro", "qwen"], default="all")
    parser.add_argument("--word", choices=CONFIG["words"])
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--encode-only", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("ffmpeg and ffprobe are required.")
    if len(CONFIG["words"]) != 32 or len(set(CONFIG["words"])) != 32:
        raise SystemExit("The audition must contain 32 distinct words.")
    dictionary = json.loads((ROOT / "public/dictionary.json").read_text())
    eligible = {w["word"] for w in dictionary["words"] if "rank" in w and w["syllables"] == [1] and any(o["requirements"] for o in w["outlines"])}
    if set(CONFIG["words"]) - eligible:
        raise SystemExit(f'Words outside eligible Common pool: {set(CONFIG["words"]) - eligible}')
    model_ids = list(CONFIG["models"]) if args.model == "all" else [args.model]
    if args.download_only:
        for model_id in model_ids:
            print(f"Downloading pinned {model_id} snapshot", flush=True)
            print(snapshot(model_id), flush=True)
        return
    record_path = WORK / "records.json"
    records = json.loads(record_path.read_text()) if record_path.exists() else {}
    manifest(records)
    for model_id in model_ids:
        voices = [v for v in CONFIG["voices"] if v["model"] == model_id]
        words = [args.word] if args.word else CONFIG["words"]
        tasks = [(v, w) for v in voices for w in words if args.force or not records.get(f'{v["id"]}:{w}') or records[f'{v["id"]}:{w}']["spec"] != generation_spec(v, w) or records[f'{v["id"]}:{w}'].get("processing") != processing_spec() or len(records[f'{v["id"]}:{w}'].get("clips", {})) != 4 or not all((PUBLIC / f["url"].lstrip("/")).exists() for f in records[f'{v["id"]}:{w}'].get("clips", {}).values())]
        if not tasks:
            print(f"{model_id}: all requested recordings cached", flush=True)
            continue
        import numpy as np
        import soundfile as sf
        import mlx.core as mx

        model = None
        model_path = None
        for voice, word in tasks:
            spec = generation_spec(voice, word)
            master = WORK / "masters" / spec[:16] / voice["id"] / f"{word}.wav"
            previous = records.get(f'{voice["id"]}:{word}', {})
            if not master.exists() or args.force:
                if args.encode_only:
                    raise SystemExit(f"Missing master: {master}")
                if model is None:
                    print(f"Loading {model_id}", flush=True)
                    model_path = snapshot(model_id)
                    from mlx_audio.tts.utils import load_model
                    model = load_model(model_path)
                seed = (CONFIG["seed"] + int(digest(f'{voice["id"]}:{word}'.encode())[:8], 16)) % (2 ** 32)
                start = time.perf_counter()
                if model_id == "kokoro":
                    options = {"voice": str(model_path / "voices" / f'{voice["voice"]}.safetensors'), "lang_code": "a", "speed": CONFIG["generationSpeed"]}
                else:
                    q = CONFIG["qwen"]
                    options = {"voice": voice["voice"], "lang_code": "English", "instruct": q["instruction"], "temperature": q["temperature"], "top_p": q["topP"], "top_k": q["topK"], "repetition_penalty": q["repetitionPenalty"], "max_tokens": q["maxTokens"], "verbose": False}
                attempts = []
                temperatures = CONFIG["qwen"]["retryTemperatures"] if model_id == "qwen" else [None]
                for attempt, temperature in enumerate(temperatures):
                    attempt_seed = (seed + attempt * 104729) % (2 ** 32)
                    mx.random.seed(attempt_seed)
                    np.random.seed(attempt_seed)
                    text = word
                    if model_id == "qwen":
                        options["temperature"] = temperature
                        text += CONFIG["qwen"]["terminalPunctuation"]
                    attempt_start = time.perf_counter()
                    results = list(model.generate(text=text, **options))
                    pieces = [np.asarray(r.audio, dtype=np.float32).reshape(-1) for r in results]
                    if not pieces or len({r.sample_rate for r in results}) != 1:
                        raise ValueError(f"Invalid generation for {voice['id']}:{word}")
                    audio = np.concatenate(pieces)
                    rate = results[0].sample_rate
                    duration = len(prepare_audio(audio, rate)) / CONFIG["sampleRate"]
                    accepted = .1 < duration < CONFIG["qwen"]["maximumWordSeconds"]
                    if model_id == "qwen" and sum(r.token_count for r in results) >= CONFIG["qwen"]["maxTokens"]:
                        accepted = False
                    attempts.append({"seed": attempt_seed, "temperature": temperature, "seconds": round(time.perf_counter() - attempt_start, 3), "duration": round(duration, 3), "accepted": accepted})
                    if accepted:
                        break
                    print(f'Retrying {voice["label"]}: {word} (rejected {duration:.2f}s output)', flush=True)
                else:
                    raise ValueError(f"No valid single-word recording for {voice['id']}:{word}")
                seconds = time.perf_counter() - start
                if not np.isfinite(audio).all() or not .1 < len(audio) / rate < 12:
                    raise ValueError(f"Invalid audio for {voice['id']}:{word}")
                master.parent.mkdir(parents=True, exist_ok=True)
                sf.write(master, audio, rate, subtype="FLOAT")
                records[f'{voice["id"]}:{word}'] = {"spec": spec, "master": str(master.relative_to(WORK)), "generationSeconds": round(seconds, 3), "attempts": attempts, "masterSha256": digest(master.read_bytes()), "clips": {}}
                write_json(record_path, records)
            else:
                seconds = previous.get("generationSeconds", 0)
                attempts = previous.get("attempts", [])
            files = encode(voice, word, master)
            records[f'{voice["id"]}:{word}'] = {"spec": spec, "processing": processing_spec(), "master": str(master.relative_to(WORK)), "generationSeconds": round(seconds, 3), "attempts": attempts, "masterSha256": digest(master.read_bytes()), "clips": files}
            write_json(record_path, records)
            current = manifest(records)
            print(f'{current["ready"]}/{current["total"]} {voice["label"]}: {word} · {files["original"]["duration"]:.2f}s audio · {seconds:.2f}s generation', flush=True)
        del model
        gc.collect()
        mx.clear_cache()
    result = manifest(records)
    print(json.dumps({"complete": result["complete"], **result["report"]}, indent=2), flush=True)


if __name__ == "__main__":
    main()
