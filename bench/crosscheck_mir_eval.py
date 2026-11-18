"""Independent check of bench/score.js against mir_eval (the standard MIR evaluation library).

Reloads every annotation with mir_eval's own file loaders, recomputes each metric from the same predictions that
score.js used (scores.json "inputs"), and compares. Exits 1 if any value differs by more than 0.001.

    pip install mir_eval            (dev-only; MIT licence)
    python bench/crosscheck_mir_eval.py [bench/out/synthetic/scores.json] [--manifest path/to/manifest.json]

Scorable regions are checked independently: this script applies its OWN half-open [start, end) masks to the reference annotations AND to the
raw predictions (read from predictions.json next to scores.json), instead of trusting the masked data score.js recorded. An annotated-but-empty
class inside a region must still score its false positives, and a class with nothing annotated and nothing predicted must be "not scored".

All times are shifted by one constant so none is negative (mir_eval rejects negative times); matching-based
scores do not change under a common shift.
"""
import json, os, sys, warnings
import numpy as np
import mir_eval

warnings.filterwarnings("ignore")  # mir_eval warns about empty or short inputs; those cases are compared anyway
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
args = sys.argv[1:]
mf = args[args.index("--manifest") + 1] if "--manifest" in args else None
pos = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] != "--manifest")]
scores_path = os.path.abspath(pos[0] if pos else os.path.join(ROOT, "bench", "out", "synthetic", "scores.json"))
S = json.load(open(scores_path, encoding="utf-8"))
manifest_path = os.path.abspath(mf) if mf else os.path.join(ROOT, S["meta"]["manifest"]["path"])
_pp = os.path.join(os.path.dirname(scores_path), "predictions.json")
PRED = {t["id"]: t for t in json.load(open(_pp, encoding="utf-8"))["tracks"]} if os.path.exists(_pp) else {}
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

def mask_times(x, regs):
    x = np.asarray(x, dtype=float)
    if regs is None: return x
    keep = np.zeros(len(x), dtype=bool)
    for r in regs: keep |= (x >= r["start"]) & (x < r["end"])
    return x[keep]

def f_or_none(ref, est, tol):
    """mir_eval F, or None when nothing is annotated AND nothing predicted (vacuous: not scored)."""
    if len(ref) == 0 and len(est) == 0: return None
    return mir_eval.onset.f_measure(np.sort(ref), np.sort(est), window=tol)[0]

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
    regs = tracks[t["id"]].get("scorable")
    raw = PRED.get(t["id"], {})
    if "beats" in A:
        # "gap" and "tempo-change" lines are annotation directives, not beats: strip them before mir_eval's loader sees them
        import tempfile
        with open(P("beats"), encoding="utf-8") as fh, tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tf:
            tf.writelines(l for l in fh if not l.lstrip().lower().startswith(("gap", "tempo-change")))
        try: bt0, lab = mir_eval.io.load_labeled_events(tf.name)
        finally: os.unlink(tf.name)
        isdown = np.array([str(l).strip() == "1" for l in lab]) if len(lab) and all(str(l).strip() for l in lab) else None
        keep = np.zeros(len(bt0), dtype=bool)
        for r in (regs or [{"start": -1e9, "end": 1e9}]): keep |= (bt0 >= r["start"]) & (bt0 < r["end"])
        bt = bt0[keep] + sh; down = (bt0[keep & isdown] + sh) if isdown is not None else None
        trk = mask_times(raw["grid"]["beats"], regs) if raw.get("grid") else np.asarray(inp["trackedBeats"], dtype=float)
        if len(bt) or len(trk):
            same(f"{t['id']} beats F", get(m, "beats.f"), mir_eval.beat.f_measure(bt, trk + sh, 0.07) if len(bt) and len(trk) else 0.0)
        else: same(f"{t['id']} beats vacuous", get(m, "beats.f"), None)
        if len(bt) and len(arr(inp["exportBeats"])): same(f"{t['id']} export beats F", get(m, "exportBeats.f"), mir_eval.beat.f_measure(bt, arr(inp["exportBeats"]), 0.07))
        if down is not None and len(down) and len(inp["trackedDownbeats"]):
            same(f"{t['id']} downbeats F", get(m, "downbeats.f"), mir_eval.beat.f_measure(down, arr(inp["trackedDownbeats"]), 0.07))
            same(f"{t['id']} export downbeats F", get(m, "exportDownbeats.f"), mir_eval.beat.f_measure(down, arr(inp["exportDownbeats"]), 0.07))
    if "key" in A and get(m, "key.scorable"):
        same(f"{t['id']} key weighted", get(m, "key.weighted"), mir_eval.key.weighted_score(mir_eval.io.load_key(P("key")), inp["key"]))
    if "chords" in A and inp.get("chords"):
        ri, rl = mir_eval.io.load_labeled_intervals(P("chords"))
        ei = np.array([[c["start"], c["end"]] for c in inp["chords"]]) + sh; el = [c["label"] for c in inp["chords"]]
        if regs is None:
            r = mir_eval.chord.evaluate(ri + sh, rl, ei, el)
            same(f"{t['id']} chords root", get(m, "chords.root"), r["root"]); same(f"{t['id']} chords majmin", get(m, "chords.majmin"), r["majmin"])
        else:  # each region on its own clipped intervals (this script's own clipping), weighted by reference seconds
            wr = wm = secs = 0.0
            for g in regs:
                lo, hi = g["start"], g["end"]
                ks = [i for i in range(len(ri)) if min(ri[i][1], hi) > max(ri[i][0], lo)]
                if not ks: continue
                rc = np.array([[max(ri[i][0], lo), min(ri[i][1], hi)] for i in ks]) + sh; rlab = [rl[i] for i in ks]
                ke = [i for i in range(len(ei)) if min(ei[i][1], hi + sh) > max(ei[i][0], lo + sh)]
                ec = np.array([[max(ei[i][0], lo + sh), min(ei[i][1], hi + sh)] for i in ke]) if ke else np.zeros((0, 2)); elab = [el[i] for i in ke]
                span = rc.max() - rc.min(); r = mir_eval.chord.evaluate(rc, rlab, ec, elab)
                wr += r["root"] * span; wm += r["majmin"] * span; secs += span
            if secs: same(f"{t['id']} chords root", get(m, "chords.root"), wr / secs); same(f"{t['id']} chords majmin", get(m, "chords.majmin"), wm / secs)
    if "drums" in A and inp.get("drums"):
        dt, dl = mir_eval.io.load_labeled_events(P("drums"))
        cls = {"kick": {"kick", "bd"}, "snare": {"snare", "sd", "clap", "cp", "rim"}, "hihat": {"hihat", "hh", "chh", "ohh", "openhat", "closedhat"}}
        full = raw.get("full"); ex = raw.get("exported"); app = {"kick": "kick", "snare": "snare", "hihat": "hats"}
        for k, names in cls.items():
            ref = mask_times(dt[np.array([str(l).lower() in names for l in dl])], regs) + sh
            est = mask_times([full["firstDown"] + s_ * ex["stepSec"] for s_ in ex[app[k]]], regs) + sh if full and ex else arr(inp["drums"][k])
            for w, key in [(0.03, "w30"), (0.05, "w50")]:
                same(f"{t['id']} {k} F ±{int(w*1000)}ms", get(m, f"drums.{k}.{key}.f"), f_or_none(ref, est, w))
    if "bass" in A and inp.get("bass") is not None:
        ri, rp = mir_eval.io.load_valued_intervals(P("bass"))
        if regs is not None:
            keepb = np.zeros(len(ri), dtype=bool)
            for r in regs: keepb |= (ri[:, 0] >= r["start"]) & (ri[:, 0] < r["end"])
            ri, rp = ri[keepb], rp[keepb]
        ri = ri + sh
        E = inp["bass"]; eon = arr([n["onset"] for n in E])
        same(f"{t['id']} bass onset F", get(m, "bass.onset.f"), f_or_none(ri[:, 0] if len(ri) else [], eon, 0.05))
        if len(E) and len(ri):
            ei = np.array([[n["onset"], n["offset"]] for n in E]) + sh; ep = mir_eval.util.midi_to_hz(np.array([n["midi"] for n in E], dtype=float))
            f = mir_eval.transcription.precision_recall_f1_overlap(ri, mir_eval.util.midi_to_hz(np.round(rp)), ei, ep, onset_tolerance=0.05, pitch_tolerance=50.0, offset_ratio=None)[2]
            same(f"{t['id']} bass note F", get(m, "bass.noteF"), f)

    if "sections" in A and inp.get("sections"):
        ri, _ = mir_eval.io.load_labeled_intervals(P("sections"))
        ei = np.array([[x["start"], x["end"]] for x in inp["sections"]]) + sh
        for w, key in [(0.5, "w05"), (3.0, "w3")]:
            same(f"{t['id']} section boundaries F ±{w}s", get(m, f"sections.{key}.f"), mir_eval.segment.detection(ri + sh, ei, window=w, trim=True)[2])

print(f"mir_eval {mir_eval.__version__} cross-check: {checks - fails}/{checks} values agree within {TOL} ({os.path.relpath(scores_path, ROOT)})")
sys.exit(1 if fails else 0)
