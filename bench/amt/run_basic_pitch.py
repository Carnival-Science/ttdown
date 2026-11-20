#!/usr/bin/env python3
"""Offline research run: Spotify Basic Pitch (ICASSP 2022 model, ONNX) on one audio file -> MIDI, at three threshold settings.

Not part of the product and not in CI. The audio, the MIDI and the run record stay OUTSIDE the repo (real music: AGENTS.md rule 4).

  python3 -m venv venv && venv/bin/pip install --no-deps basic-pitch==0.4.0
  venv/bin/pip install onnxruntime numpy scipy librosa resampy pretty_midi mir_eval typing_extensions
  venv/bin/python bench/amt/run_basic_pitch.py "audio.mp3" NEW-OUTPUT-DIR

(`pip install basic-pitch` alone needs TensorFlow and CoreML on macOS and did not resolve on Python 3.12; --no-deps plus the ONNX
runtime does, and the ONNX model ships inside the wheel. Only basic-pitch is pinned: the other versions used by the first run were not
recorded. This script now records every one.) Settings: "default" = the library defaults (untuned); "tight" and "loose" bracket them.
Score with bench/amt/score-notes.js.

The output directory must be outside the repository and must not exist yet, or be empty: nothing is overwritten. It receives
bp_<setting>.mid and run.json, which records: the repo commit (and whether files were modified), Python and package versions, the
model file and its SHA-256, the input audio's SHA-256 and size, the full predict() settings including the library defaults, each output's
SHA-256 and note count, and the timings, kept apart:
  model_load_s       loading the ONNX model (cold start)
  first_inference_s  one discarded run at the default settings (first-inference warm-up; includes reading and resampling the audio)
  processing_s       each setting's run afterwards (each also reads and resamples the audio)
Timings are wall-clock on whatever machine ran it (recorded as platform), from one run each: not a benchmark.
"""
import hashlib, importlib.metadata as md, inspect, json, os, pathlib, platform, subprocess, sys, time
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
SETTINGS = {"default": {}, "tight": dict(onset_threshold=0.6, frame_threshold=0.4, minimum_note_length=80),
            "loose": dict(onset_threshold=0.4, frame_threshold=0.2, minimum_note_length=60)}
PACKAGES = ["basic-pitch", "onnxruntime", "numpy", "scipy", "librosa", "resampy", "pretty_midi", "mir_eval"]


def refuse(msg):
    print(f"run_basic_pitch: {msg}", file=sys.stderr); sys.exit(2)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def inside(child, parent):
    """True when child is parent or below it. Both are resolved through symlinks and junctions (os.path.realpath) and compared by whole
    path parts, so a name beginning with ".." is inside, not a step up."""
    c, p = (os.path.normcase(os.path.realpath(x)) for x in (child, parent))
    try: return os.path.commonpath([c, p]) == p
    except ValueError: return False                  # different drives


def git(*args):
    try: r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    except OSError: return None
    return r.stdout.strip() if r.returncode == 0 else None


def version(name):
    try: return md.version(name)
    except md.PackageNotFoundError: return None


def main(argv):
    if len(argv) != 2: refuse('usage: run_basic_pitch.py "audio.mp3" NEW-OUTPUT-DIR')
    audio, out = pathlib.Path(argv[0]).resolve(), pathlib.Path(argv[1]).resolve()
    if not audio.is_file(): refuse(f"no audio file at {audio}")
    if inside(out, ROOT): refuse(f"the output directory must be outside the repository ({ROOT}): it holds results from private material")
    if out.exists() and (not out.is_dir() or any(out.iterdir())): refuse(f"{out} already exists and is not an empty directory; choose a new one (nothing is overwritten)")
    out.mkdir(parents=True, exist_ok=True)
    if inside(out, ROOT): refuse(f"{out} resolves inside the repository ({ROOT}); stopping")   # again, now that it exists

    from basic_pitch import ICASSP_2022_MODEL_PATH                  # imported only after the checks, so they work without the package
    from basic_pitch.inference import Model, predict
    onnx = pathlib.Path(ICASSP_2022_MODEL_PATH).parent / "nmp.onnx"
    defaults = {k: p.default for k, p in inspect.signature(predict).parameters.items() if p.default is not inspect.Parameter.empty and k != "model_or_model_path"}
    status = git("status", "--porcelain")
    run = {
        "kind": "amt-basic-pitch-run", "version": 2, "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repo": {"commit": git("rev-parse", "HEAD"), "modified": None if status is None else bool(status), "script_sha256": sha256(__file__)},
        "python": sys.version.split()[0], "platform": platform.platform(), "machine": platform.machine(), "processor": platform.processor() or None,
        "packages": {p: version(p) for p in PACKAGES},
        "model": {"file": onnx.name, "sha256": sha256(onnx), "bytes": onnx.stat().st_size},
        "input": {"file": audio.name, "sha256": sha256(audio), "bytes": audio.stat().st_size},
        "library_defaults": {k: v if isinstance(v, (int, float, str, bool, type(None))) else repr(v) for k, v in defaults.items()},
        "timing": {}, "outputs": {},
    }
    t = time.perf_counter(); model = Model(onnx); run["timing"]["model_load_s"] = round(time.perf_counter() - t, 3)
    t = time.perf_counter(); predict(str(audio), model); run["timing"]["first_inference_s"] = round(time.perf_counter() - t, 3)
    run["timing"]["processing_s"] = {}
    for name, kw in SETTINGS.items():
        target = out / f"bp_{name}.mid"
        if target.exists(): refuse(f"{target} appeared during the run; stopping rather than overwrite it")
        t = time.perf_counter(); _, midi, events = predict(str(audio), model, **kw); dt = round(time.perf_counter() - t, 3)
        midi.write(str(target))
        run["timing"]["processing_s"][name] = dt
        run["outputs"][name] = {"file": target.name, "sha256": sha256(target), "notes": len(events), "settings": {**run["library_defaults"], **kw}, "overrides": kw}
        print(f"{name}: {len(events)} notes, {dt:.2f} s ({kw or 'library defaults'})")
    with open(out / "run.json", "x", encoding="utf-8") as f: json.dump(run, f, indent=2); f.write("\n")
    print(f"model load {run['timing']['model_load_s']:.2f} s, first inference {run['timing']['first_inference_s']:.2f} s (warm-up, discarded); wrote {out / 'run.json'}")


if __name__ == "__main__":
    main(sys.argv[1:])
