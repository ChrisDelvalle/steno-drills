"""Additional local candidates; original recordings and masters stay unchanged."""
import argparse
import gc
import json
from pathlib import Path
import time

import generate as base

CONFIG = json.loads(Path(__file__).with_name("candidates.json").read_text())
RECORDS = base.WORK / "candidate-records.json"


def fingerprint(value):
    return base.digest(json.dumps(value, sort_keys=True).encode())


def snapshot(model_id):
    from huggingface_hub import snapshot_download

    model = CONFIG["models"].get(model_id, base.CONFIG["models"].get(model_id))
    patterns = ["*.json", "*.safetensors", "*.txt", "*.md", "speech_tokenizer/*"]
    if model_id == "kokoro":
        patterns = ["config.json", "kokoro-v1_0.safetensors", "README.md", "voices/af_heart.safetensors", "voices/am_michael.safetensors", "voices/am_fenrir.safetensors"]
    return Path(snapshot_download(repo_id=model["repository"], revision=model["revision"], allow_patterns=patterns, max_workers=3))


def specification(voice, word):
    model = CONFIG["models"].get(voice["model"], base.CONFIG["models"].get(voice["model"]))
    return fingerprint({"version": 1, "voice": voice, "word": word, "model": model,
        "seed": base.CONFIG["seed"], "packages": base.versions(),
        "qwen": CONFIG["qwen"] if voice["model"] in ("qwen", "clone") else None,
        "context": {**CONFIG["context"], "words": base.CONFIG["words"]} if voice.get("context") else None,
        "reference": {"text": CONFIG["referenceText"], "design": CONFIG["models"]["design"]} if voice["model"] == "clone" else None})


def valid(record, spec):
    return record and record.get("spec") == spec and record.get("processing") == base.processing_spec() and len(record.get("clips", {})) == 4 and all((base.PUBLIC / f["url"].lstrip("/")).is_file() for f in record["clips"].values())


def save_record(records, voice, word, master, seconds, attempts=None, extraction=None):
    key = f'{voice["id"]}:{word}'
    records[key] = {"spec": specification(voice, word), "master": str(master.relative_to(base.WORK)),
        "generationSeconds": round(seconds, 4), "attempts": attempts or [],
        "masterSha256": base.digest(master.read_bytes()), "processing": base.processing_spec(),
        "clips": base.encode(voice, word, master, trim=voice["model"] != "reuse")}
    if extraction:
        records[key]["extraction"] = extraction
    base.write_json(RECORDS, records)


def all_voices():
    return [{**v, "detail": "Original audition"} for v in base.CONFIG["voices"]] + CONFIG["voices"]


def publish(records, originals):
    clips, timings = {}, {}
    ready = 0
    sizes = {"original": 0, "16": 0, "20": 0, "24": 0}
    for voice in all_voices():
        clips[voice["id"]] = {}
        timings[voice["id"]] = 0
        for word in base.CONFIG["words"]:
            key = f'{voice["id"]}:{word}'
            original = voice["id"] in {v["id"] for v in base.CONFIG["voices"]}
            record = (originals if original else records).get(key)
            spec = base.generation_spec(next(v for v in base.CONFIG["voices"] if v["id"] == voice["id"]), word) if original else specification(voice, word)
            if not valid(record, spec):
                continue
            clips[voice["id"]][word] = record["clips"]
            timings[voice["id"]] += record["generationSeconds"]
            ready += 1
            for quality, clip in record["clips"].items():
                sizes[quality] += clip["bytes"]
    sequences = {}
    for voice in all_voices():
        sequence = records.get(f'sequence:{voice["id"]}')
        words = clips[voice["id"]]
        if not all(word in words for word in CONFIG["sequence"]["words"]):
            continue
        spec = sequence_spec(words)
        if sequence and sequence.get("spec") == spec and len(sequence.get("clips", {})) == 4 and all((base.PUBLIC / f["url"].lstrip("/")).is_file() for f in sequence["clips"].values()):
            sequences[voice["id"]] = sequence["clips"]
            for quality, clip in sequence["clips"].items():
                sizes[quality] += clip["bytes"]
    total = len(all_voices()) * len(base.CONFIG["words"])
    value = {"version": 2, "voices": all_voices(), "words": base.CONFIG["words"],
        "notes": {"read": "ambiguous", "lead": "ambiguous", "wind": "ambiguous", "live": "ambiguous"},
        "clips": clips, "sequences": sequences, "sequence": CONFIG["sequence"], "ready": ready, "total": total,
        "complete": ready == total and len(sequences) == len(all_voices()),
        "report": {"generationSeconds": {k: round(v, 2) for k, v in timings.items()}, "bytesByQuality": sizes},
        "settings": CONFIG, "packages": base.versions()}
    base.write_json(base.PUBLIC / "candidates.json", value)
    return value


def sequence_spec(words):
    return fingerprint({"version": 1, **CONFIG["sequence"], "sources": [words[w]["original"]["sha256"] for w in CONFIG["sequence"]["words"]], "encoding": base.CONFIG["encoding"]})


def make_sequences(records, originals):
    import numpy as np
    import soundfile as sf

    current = publish(records, originals)
    rate = base.CONFIG["sampleRate"]
    pause = np.zeros(round(rate * CONFIG["sequence"]["pauseMilliseconds"] / 1000), dtype=np.float32)
    for voice in all_voices():
        words = current["clips"][voice["id"]]
        if not all(w in words for w in CONFIG["sequence"]["words"]):
            continue
        key = f'sequence:{voice["id"]}'
        spec = sequence_spec(words)
        previous = records.get(key)
        if previous and previous.get("spec") == spec and len(previous.get("clips", {})) == 4 and all((base.PUBLIC / f["url"].lstrip("/")).is_file() for f in previous["clips"].values()):
            continue
        parts, boundaries, position = [], [], 0
        for word in CONFIG["sequence"]["words"]:
            if parts:
                parts.append(pause)
                position += len(pause)
            path = base.PUBLIC / words[word]["original"]["url"].lstrip("/")
            audio, actual_rate = sf.read(path, dtype="float32")
            if actual_rate != rate:
                raise ValueError("Sequence source sample rate mismatch")
            boundaries.append({"word": word, "startSample": position, "endSample": position + len(audio)})
            parts.append(audio)
            position += len(audio)
        audio = np.concatenate(parts)
        master = base.WORK / "masters" / spec[:16] / voice["id"] / "sequence.wav"
        master.parent.mkdir(parents=True, exist_ok=True)
        sf.write(master, audio, rate, subtype="FLOAT")
        records[key] = {"spec": spec, "boundaries": boundaries, "sampleRate": rate,
            "clips": base.encode(voice, "sequence", master, process=False)}
        base.write_json(RECORDS, records)
        print(f'Sequence: {voice["label"]} · {len(audio) / rate:.1f}s · 450 ms pauses', flush=True)
    return publish(records, originals)


def seed_for(value):
    return (base.CONFIG["seed"] + int(base.digest(value.encode())[:8], 16)) % (2 ** 32)


def generate_single(model, voice, word, model_path, reference=None, validator=None):
    import mlx.core as mx
    import numpy as np

    attempts = []
    start = time.perf_counter()
    options = {"lang_code": "English", "top_p": .8, "top_k": 20, "repetition_penalty": 1.05, "max_tokens": 64, "verbose": False}
    if voice["model"] == "kokoro":
        options = {"voice": ",".join(str(model_path / "voices" / f"{v}.safetensors") for v in voice["voice"].split(",")), "lang_code": "a", "speed": voice.get("speed", 1)}
    elif voice["model"] == "qwen":
        options.update(voice=voice["voice"], instruct=voice.get("instruction", CONFIG["qwen"]["instruction"]))
    else:
        options.update(ref_audio=str(reference), ref_text=CONFIG["referenceText"])
    temperatures = [None] if voice["model"] == "kokoro" else voice.get("retryTemperatures", CONFIG["qwen"]["retryTemperatures"])
    for attempt, temperature in enumerate(temperatures):
        seed = (seed_for(f'{voice["id"]}:{word}') + attempt * 104729) % (2 ** 32)
        mx.random.seed(seed)
        np.random.seed(seed)
        if temperature is not None:
            options["temperature"] = temperature
        tick = time.perf_counter()
        results = list(model.generate(text=word if voice["model"] == "kokoro" else word + ".", **options))
        duration = 0
        try:
            if not results or len({r.sample_rate for r in results}) != 1:
                raise ValueError("Invalid generation result")
            audio = np.concatenate([np.asarray(r.audio, dtype=np.float32).reshape(-1) for r in results])
            rate = results[0].sample_rate
            duration = len(base.prepare_audio(audio, rate)) / base.CONFIG["sampleRate"]
            accepted = .1 < duration < 2.5 and (temperature is None or sum(r.token_count for r in results) < options["max_tokens"])
        except ValueError:
            accepted = False
        review = validator(audio, rate) if accepted and validator else None
        if review is not None:
            accepted = review['matched']
        attempts.append({"seed": seed, "temperature": temperature, "seconds": round(time.perf_counter() - tick, 3), "duration": round(duration, 3), "accepted": accepted, **({'phonetics': review} if review is not None else {})})
        if accepted:
            return audio, rate, time.perf_counter() - start, attempts
        print(f'Retrying {voice["label"]}: {word} ({duration:.2f}s)', flush=True)
    raise ValueError(f'No valid word recording: {voice["id"]}:{word}')


def generate_context(model, model_path, voice, records, force):
    import numpy as np
    import soundfile as sf

    pipeline = model._get_pipeline("a")
    voice_path = str(model_path / "voices" / f'{voice["voice"]}.safetensors')
    batch_size = voice.get("batchSize", CONFIG["context"]["batchSize"])
    for index in range(0, len(base.CONFIG["words"]), batch_size):
        words = base.CONFIG["words"][index:index + batch_size]
        if not force and all(valid(records.get(f'{voice["id"]}:{w}'), specification(voice, w)) for w in words):
            continue
        text = ", ".join(words) + "."
        spec = fingerprint({"recipe": specification(voice, words[0]), "text": text})
        directory = base.WORK / "masters" / spec[:16] / voice["id"]
        context_master, context_meta = directory / "context.wav", directory / "context.json"
        if not force and context_master.exists() and context_meta.exists():
            raw, rate = sf.read(context_master, dtype="float32")
            metadata = json.loads(context_meta.read_text())
        else:
            start = time.perf_counter()
            results = list(pipeline(text, voice=voice_path, speed=voice.get("speed", 1), split_pattern=None))
            if len(results) != 1:
                raise ValueError("Context list unexpectedly split")
            result = results[0]
            raw = np.asarray(result.audio, dtype=np.float32).reshape(-1)
            rate = model.config.sample_rate
            tokens = [{"word": t.text.lower().strip(",."), "start": t.start_ts, "end": t.end_ts} for t in result.tokens if t.text.strip(",.").isalpha()]
            if [t["word"] for t in tokens] != words or any(t["start"] is None or t["end"] is None for t in tokens):
                raise ValueError(f"Invalid contextual word alignment: {tokens}")
            metadata = {"text": text, "seconds": time.perf_counter() - start, "tokens": tokens}
            directory.mkdir(parents=True, exist_ok=True)
            sf.write(context_master, raw, rate, subtype="FLOAT")
            base.write_json(context_meta, metadata)
        padding = CONFIG["context"]["paddingMilliseconds"] / 1000
        for i, token in enumerate(metadata["tokens"]):
            # Model timing estimates need a guard; never include a neighboring word.
            left = max(0, token["start"] - padding)
            right = min(len(raw) / rate, token["end"] + padding)
            if i:
                left = max(left, (metadata["tokens"][i - 1]["end"] + token["start"]) / 2)
            if i + 1 < len(words):
                right = min(right, (token["end"] + metadata["tokens"][i + 1]["start"]) / 2)
            first, last = round(left * rate), round(right * rate)
            audio = raw[first:last]
            if not .1 < len(audio) / rate < 2.5 or not np.isfinite(audio).all():
                raise ValueError(f'Invalid context slice: {token["word"]}')
            master = directory / f'{token["word"]}.wav'
            sf.write(master, audio, rate, subtype="FLOAT")
            extraction = {"contextMaster": str(context_master.relative_to(base.WORK)), "text": text, "modelStart": token["start"], "modelEnd": token["end"], "firstSample": first, "lastSample": last, "sampleRate": rate}
            save_record(records, voice, token["word"], master, metadata["seconds"] / len(words), extraction=extraction)
        print(f'{voice["label"]}: {", ".join(words)}', flush=True)


def make_references(voices, force=False):
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model

    references = {}
    model = None
    for voice in voices:
        spec = fingerprint({"version": 1, "voice": voice, "text": CONFIG["referenceText"], "model": CONFIG["models"]["design"], "packages": base.versions(), "seed": base.CONFIG["seed"], "temperature": .5, "topP": .8, "topK": 20, "maxTokens": 768})
        path = base.WORK / "masters" / spec[:16] / voice["id"] / "reference.wav"
        if force or not path.exists() or not path.with_suffix(".json").exists():
            if model is None:
                print("Loading pinned VoiceDesign model", flush=True)
                model = load_model(snapshot("design"))
            start = time.perf_counter()
            seed = seed_for(voice["id"] + ":reference")
            mx.random.seed(seed)
            np.random.seed(seed)
            results = list(model.generate(text=CONFIG["referenceText"], instruct=voice["description"], lang_code="English", temperature=.5, top_p=.8, top_k=20, repetition_penalty=1.05, max_tokens=768, verbose=False))
            audio = np.concatenate([np.asarray(r.audio, dtype=np.float32).reshape(-1) for r in results])
            rate = results[0].sample_rate
            if not 5 < len(audio) / rate < 35 or not np.isfinite(audio).all() or sum(r.token_count for r in results) >= 768:
                raise ValueError("Invalid synthetic reference")
            path.parent.mkdir(parents=True, exist_ok=True)
            sf.write(path, audio, rate, subtype="FLOAT")
            base.write_json(path.with_suffix(".json"), {"spec": spec, "text": CONFIG["referenceText"], "description": voice["description"], "seed": seed, "seconds": round(time.perf_counter() - start, 3), "sha256": base.digest(path.read_bytes())})
            print(f'{voice["label"]}: synthetic reference ready', flush=True)
        references[voice["id"]] = path
    del model
    gc.collect()
    mx.clear_cache()
    return references


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--family", choices=["all", "reuse", "kokoro", "qwen", "clone"], default="all")
    parser.add_argument("--candidate", choices=[v["id"] for v in CONFIG["voices"]])
    parser.add_argument("--sequences-only", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    originals = json.loads((base.WORK / "records.json").read_text())
    records = json.loads(RECORDS.read_text()) if RECORDS.exists() else {}
    make_sequences(records, originals)
    if args.sequences_only:
        return
    import mlx.core as mx
    import soundfile as sf
    from mlx_audio.tts.utils import load_model

    for family in ["reuse", "kokoro", "qwen", "clone"]:
        if args.family not in ("all", family):
            continue
        voices = [v for v in CONFIG["voices"] if v["model"] == family and (not args.candidate or v["id"] == args.candidate)]
        voices = [v for v in voices if args.force or any(not valid(records.get(f'{v["id"]}:{w}'), specification(v, w)) for w in base.CONFIG["words"])]
        if not voices:
            continue
        references = make_references(voices, args.force) if family == "clone" else {}
        model = None
        model_path = None
        if family != "reuse":
            print(f"Loading {family}", flush=True)
            model_path = snapshot(family)
            model = load_model(model_path)
        for voice in voices:
            if voice.get("context"):
                generate_context(model, model_path, voice, records, args.force)
            else:
                for word in base.CONFIG["words"]:
                    if not args.force and valid(records.get(f'{voice["id"]}:{word}'), specification(voice, word)):
                        continue
                    spec = specification(voice, word)
                    master = base.WORK / "masters" / spec[:16] / voice["id"] / f"{word}.wav"
                    metadata_path = master.with_suffix(".json")
                    if family == "reuse":
                        master = base.WORK / originals[f'{voice["source"]}:{word}']["master"]
                        seconds, attempts = 0, []
                    elif not args.force and master.exists() and metadata_path.exists():
                        metadata = json.loads(metadata_path.read_text())
                        seconds, attempts = metadata["seconds"], metadata["attempts"]
                    else:
                        audio, rate, seconds, attempts = generate_single(model, voice, word, model_path, references.get(voice["id"]))
                        master.parent.mkdir(parents=True, exist_ok=True)
                        sf.write(master, audio, rate, subtype="FLOAT")
                        base.write_json(metadata_path, {"seconds": seconds, "attempts": attempts})
                    save_record(records, voice, word, master, seconds, attempts)
                    print(f'{voice["label"]}: {word}', flush=True)
            current = make_sequences(records, originals)
            print(f'{current["ready"]}/{current["total"]} recordings ready', flush=True)
        del model
        gc.collect()
        mx.clear_cache()
    report = make_sequences(records, originals)
    print(json.dumps({"complete": report["complete"], **report["report"]}, indent=2), flush=True)


if __name__ == "__main__":
    main()
