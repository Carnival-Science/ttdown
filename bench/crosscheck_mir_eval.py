"""Independent check of bench/score.js against mir_eval (the standard MIR evaluation library).

Reloads every annotation with mir_eval's own file loaders, recomputes each metric from the same predictions that
score.js used (scores.json "inputs"), and compares. Exits 1 if any value differs by more than 0.001.

    pip install mir_eval            (dev-only; MIT licence)
    python bench/crosscheck_mir_eval.py [bench/out/synthetic/scores.json]

All times are shifted by one constant so none is negative (mir_eval rejects negative times); matching-based
scores do not change under a common shift.
"""
import json, os, sys, warnings
import numpy as np
import mir_eval

warnings.filterwarnings("ignore")  # mir_eval warns about empty or short inputs; those cases are compared anyway
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
scores_path = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "bench", "out", "synthetic", "scores.json"))
S = json.load(open(scores_path, encoding="utf-8"))
manifest_path = os.path.join(ROOT, S["meta"]["manifest"]["path"])
manifest = json.load(open(manifest_path, encoding="utf-8")); mdir = os.path.dirname(manifest_path)
tracks = {t["id"]: t for t in manifest["tracks"]}
TOL = 1e-3
checks = fails = 0

def same(what, ours, theirs):
    global checks, fails
    checks += 1
    if ours is None and theirs is None: return
    if ours is None or theirs is None or abs(float(ours) - float(theirs)) > TOL:
        fails += 1; print(f"MISMATCH {what}: ours {ours} vs mir_eval {theirs}")

def get(d, path):
    for k in path.split("."):
        if d is None: return None
        d = d.get(k)
    return d

for t in S["tracks"]:
    m, inp = t.get("metrics"), t.get("inputs")
    if not m: continue
    A = tracks[t["id"]]["annotations"]; P = lambda k: os.path.join(mdir, A[k])
    # one shift for the whole track, large enough to make every time non-negative
    lows = [0.0] + [min(v) for k, v in inp.items() if isinstance(v, list) and v and isinstance(v[0], (int, float))]
    lows += [min(v) for v in (inp.get("drums") or {}).values() if v] + [s["start"] for s in inp.get("chords") or []][:1] + [n["onset"] for n in inp.get("bass") or []][:1]
    sh = max(0.0, -min(lows)) + 0.0
    arr = lambda v: np.asarray(v, dtype=float) + sh
    if "beats" in A:
        bt, lab = mir_eval.io.load_labeled_events(P("beats")); bt = bt + sh
        down = bt[np.array([str(l).strip() == "1" for l in lab])] if len(lab) and all(str(l).strip() for l in lab) else None
        same(f"{t['id']} beats F", get(m, "beats.f"), mir_eval.beat.f_measure(bt, arr(inp["trackedBeats"]), 0.07))
        same(f"{t['id']} export beats F", get(m, "exportBeats.f"), mir_eval.beat.f_measure(bt, arr(inp["exportBeats"]), 0.07))
        if down is not None:
            same(f"{t['id']} downbeats F", get(m, "downbeats.f"), mir_eval.beat.f_measure(down, arr(inp["trackedDownbeats"]), 0.07))
            same(f"{t['id']} export downbeats F", get(m, "exportDownbeats.f"), mir_eval.beat.f_measure(down, arr(inp["exportDownbeats"]), 0.07))
    if "key" in A and get(m, "key.scorable"):
        same(f"{t['id']} key weighted", get(m, "key.weighted"), mir_eval.key.weighted_score(mir_eval.io.load_key(P("key")), inp["key"]))
    if "chords" in A and inp.get("chords"):
        ri, rl = mir_eval.io.load_labeled_intervals(P("chords"))
        ei = np.array([[c["start"], c["end"]] for c in inp["chords"]]) + sh; el = [c["label"] for c in inp["chords"]]
        r = mir_eval.chord.evaluate(ri + sh, rl, ei, el)
        same(f"{t['id']} chords root", get(m, "chords.root"), r["root"]); same(f"{t['id']} chords majmin", get(m, "chords.majmin"), r["majmin"])
    if "drums" in A and inp.get("drums"):
        dt, dl = mir_eval.io.load_labeled_events(P("drums")); dt = dt + sh
        cls = {"kick": {"kick", "bd"}, "snare": {"snare", "sd", "clap", "cp", "rim"}, "hihat": {"hihat", "hh", "chh", "ohh", "openhat", "closedhat"}}
        for k, names in cls.items():
            ref = np.sort(dt[np.array([str(l).lower() in names for l in dl])])
            for w, key in [(0.03, "w30"), (0.05, "w50")]:
                same(f"{t['id']} {k} F ±{int(w*1000)}ms", get(m, f"drums.{k}.{key}.f"), mir_eval.onset.f_measure(ref, np.sort(arr(inp["drums"][k])), window=w)[0])
    if "bass" in A and inp.get("bass") is not None:
        ri, rp = mir_eval.io.load_valued_intervals(P("bass")); ri = ri + sh
        E = inp["bass"]; eon = arr([n["onset"] for n in E])
        same(f"{t['id']} bass onset F", get(m, "bass.onset.f"), mir_eval.onset.f_measure(np.sort(ri[:, 0]), np.sort(eon), window=0.05)[0])
        if len(E):
            ei = np.array([[n["onset"], n["offset"]] for n in E]) + sh; ep = mir_eval.util.midi_to_hz(np.array([n["midi"] for n in E], dtype=float))
            f = mir_eval.transcription.precision_recall_f1_overlap(ri, mir_eval.util.midi_to_hz(np.round(rp)), ei, ep, onset_tolerance=0.05, pitch_tolerance=50.0, offset_ratio=None)[2]
            same(f"{t['id']} bass note F", get(m, "bass.noteF"), f)

print(f"mir_eval {mir_eval.__version__} cross-check: {checks - fails}/{checks} values agree within {TOL} ({os.path.relpath(scores_path, ROOT)})")
sys.exit(1 if fails else 0)
