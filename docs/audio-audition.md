# Local voice auditions

Run `npm run audio:audition` and open <http://127.0.0.1:4174/>. Each candidate has a row with **Sequence** and individual-word Play buttons. The Word selector chooses any of the original 32 words. Select Original to compare voices, then 16, 20, or 24 kbps to compare compression. Speed changes preserve pitch. Another Play button replaces the current recording; the same button replays it from the beginning.

For the chosen Clear instructor voice, open <http://127.0.0.1:4174/?compare=instructor> or choose Clear instructor in Compare. Each row is a quality: Original, 16, 12, 10, 8, or 6 kbps. Every row has the identical paused sequence and all 32 individual words. The Compare selector keeps the original voice comparison available. Recreate the additional encodings with `npm run audio:audition:compress`; this is a Node/FFmpeg-only command and never loads a speech model. It verifies the lossless source checksums and reuses the same VBR, 20 ms frames, complexity 10, and general audio encoding mode at every bitrate. Existing recordings are preserved.

Measured Clear instructor sizes for all 32 individual words: 41,883 bytes at 16 kbps, 31,697 at 12, 27,989 at 10, 22,775 at 8, and 19,155 at 6. The ten-word sequence is 16,031 / 11,274 / 9,901 / 7,781 / 6,487 bytes respectively. Re-encoding the 132 new files took 20.01 seconds locally, with no additional speech generation. The compression manifest and files remain in the ignored audition directory.

Every sequence uses the same ten words: judge, name, fit, van, lead, feet, pull, thin, main, wind. Exactly 450 ms of digital silence is inserted between source clips at 1×, in addition to their existing natural padding. Sequences are assembled from lossless clips and encoded once at each bitrate; they are not concatenations of compressed files. Playback speed scales the whole recording, including pauses.

The four original candidates remain unchanged. Twelve additional candidates compare Michael at 0.85× synthesis, untrimmed Michael, contextual Michael at 1× and 0.85×, Michael in a longer 32-word context at 0.9×, Fenrir, a Michael/Fenrir blend at 0.9×, contextual Heart at 0.9×, restrained Aiden and Ryan, and two synthetic Qwen voice designs. Labels describe the generation experiment, not a guaranteed improvement in perceived quality.

This is a local experiment. It does not change practice settings, Plover files, or the deployed site. Words marked “ambiguous” have multiple valid English pronunciations; the audition exposes each model's isolated-word reading rather than assuming those readings match.

To recreate the recordings on Apple Silicon, install `uv`, Python 3.12, and FFmpeg with `libopus`, then run:

```sh
npm run audio:audition:generate
npm run audio:audition:candidates
```

The Python dependency lock and `scripts/audio-audition/config.json` pin model revisions, voice IDs, seed, sampling controls, and codec settings. The generator uses each model once, generates one word at a time, retains unprocessed float WAV masters, and makes level-matched 24-bit PCM comparison WAVs. Opus versions are encoded from the exact same comparison WAV at 16/20/24 kbps with VBR, 20 ms frames, and encoder complexity 10. These audition clips are individually encoded; production sprite compression and packing remain deferred.

`scripts/audio-audition/candidates.json` pins the additional recipe. Contextual Kokoro candidates synthesize eight-word comma-separated lists (32 words for the longer-context candidate), retain those complete masters, and extract words using predicted phoneme durations with a 65 ms guard bounded by neighboring words. Extraction bounds are retained for inspection; their pronunciation and boundaries still need listening review. Untrimmed Michael reuses the original raw masters with exactly the same gain as the trimmed comparison and no silence removal.

The two designed voices are entirely synthetic. The pinned Qwen VoiceDesign model generates a reference passage for each, then the pinned Qwen Base model reuses that passage and its transcript for every word. No person's recording is used. The references and generation settings remain in the ignored local masters directory. The additional model downloads are approximately 4.5 GB each, with sufficient free disk space required before generation.

Qwen receives a terminal period to finish the isolated-word utterance. Overlong output or output reaching the token limit is rejected, with deterministic seed/temperature retries recorded in the local metadata. A recording must remain under 2.5 seconds after conservative trimming; no generated speech is cut short to satisfy that limit. A failed retry sequence stops generation instead of publishing that sample. Run `npm run data:build` first when generating in a fresh checkout without the dictionary index.

Generated files live entirely in the ignored `.audio-audition/` directory: local Python environment and caches, pinned model downloads, raw masters, per-recording generation times/checksums, and browser-ready audio plus `public/auditions.json`. Python and model downloads are not part of `npm run build`, and the local server exposes only the audition page and public audio assets. The server binds to `127.0.0.1`, supports audio range requests, and does not serve models or repository files. Use `npm run audio:audition -- --port 4175` if the default port is occupied.

Generation resumes from existing masters. Useful commands:

```sh
npm run audio:audition:generate -- --model kokoro
npm run audio:audition:generate -- --model qwen
npm run audio:audition:generate -- --model qwen --word read --force
npm run audio:audition:candidates -- --candidate michaelslow
npm run audio:audition:candidates -- --family clone
npm run audio:audition:candidates -- --sequences-only
```

The final generation output, `auditions.json` (original set), and `candidates.json` (combined comparison) report inference time per candidate and total bytes for each quality. Word-generation totals exclude environment installation, downloads, model loading, encoding, and synthetic-reference generation; reference-generation times are recorded beside the retained references. Raw masters preserve generated output before silence trimming and level matching, allowing later processing changes without model inference. `candidate-records.json` retains sequence boundaries, inserted pauses, checksums, and extraction provenance. The original clips remain byte-for-byte unchanged.

Kokoro model: [MLX snapshot](https://huggingface.co/mlx-community/Kokoro-82M-bf16), [original model](https://huggingface.co/hexgrad/Kokoro-82M). Qwen model: [MLX snapshot](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16), [original project](https://github.com/QwenLM/Qwen3-TTS). Both selected model cards specify Apache-2.0. Dependencies and model weights remain local; the repository contains the harness and pinned generation recipe.

Bulk generation, sprite packing, production settings, and deployment wait for audition feedback.

Measured on the M1 Max for the 32-word, four-voice audition: 128 recordings and 512 playable files. The complete set occupies 5,678,880 bytes as PCM originals, 174,851 bytes at 16 kbps, 210,278 bytes at 20 kbps, and 247,393 bytes at 24 kbps. Final-batch inference totals were 31.64 seconds for Kokoro and 44.41 seconds for Qwen; these exclude downloads, model loading, encoding, and the discarded initial Qwen trial. The accepted Qwen batch required eight rejected/retried attempts. All 512 files passed checksums, full browser decoding, and native-browser playback through completion.

The expanded comparison has 16 candidates, 512 word recordings, and 16 sequences: 2,112 playable files across the four qualities. Including both individual words and sequences, the PCM originals occupy 34,017,312 bytes, 16 kbps occupies 939,939 bytes, 20 kbps occupies 1,126,731 bytes, and 24 kbps occupies 1,333,500 bytes. All qualities together use 37.4 MB; masters, models, and discarded trials are separate and ignored. Sequences range from 7.46–16.23 seconds at 1×. Additional accepted word-generation time totals 134.96 seconds, with 13.25 seconds for the two synthetic reference passages. The two additional model downloads took 458.0 and 426.4 seconds. These are measured warm/local-run figures, not bulk-generation performance guarantees.
