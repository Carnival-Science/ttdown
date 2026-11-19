#!/usr/bin/env python3
"""Offline research run: Spotify Basic Pitch (ICASSP 2022 model, ONNX) on one audio file -> MIDI, at three threshold settings.

Not part of the product and not in CI. The audio and MIDI stay OUTSIDE the repo (real music: AGENTS.md rule 4).

  python3 -m venv venv && venv/bin/pip install --no-deps basic-pitch
  venv/bin/pip install onnxruntime numpy scipy librosa resampy pretty_midi mir_eval typing_extensions
  venv/bin/python bench/amt/run_basic_pitch.py "audio.mp3" out-dir

(`pip install basic-pitch` alone needs TensorFlow and CoreML on macOS and did not resolve on Python 3.12; --no-deps plus the ONNX
runtime does not, and the ONNX model ships inside the wheel.) Settings: "default" = the library defaults (untuned); "tight" and
"loose" are NOT tuned for any track, they bracket the defaults. Score with bench/amt/score-notes.js.
"""
import pathlib, sys, time
from basic_pitch import ICASSP_2022_MODEL_PATH
from basic_pitch.inference import Model, predict

audio, out = sys.argv[1], pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
onnx = pathlib.Path(ICASSP_2022_MODEL_PATH).parent / "nmp.onnx"
model = Model(onnx)
SETTINGS = {"default": {}, "tight": dict(onset_threshold=0.6, frame_threshold=0.4, minimum_note_length=80),
            "loose": dict(onset_threshold=0.4, frame_threshold=0.2, minimum_note_length=60)}
for name, kw in SETTINGS.items():
    t = time.time(); _, midi, events = predict(audio, model, **kw); midi.write(str(out / f"bp_{name}.mid"))
    print(f"{name}: {len(events)} notes, {time.time() - t:.1f} s ({kw or 'library defaults'})")
