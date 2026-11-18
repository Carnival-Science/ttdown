"""Independent check of bench/score.js against mir_eval (the standard MIR evaluation library).

Reloads every annotation with mir_eval's own file loaders, recomputes each metric from the same predictions that
score.js used (scores.json "inputs"), and compares. Exits 1 if any value differs by more than 0.001.

    pip install mir_eval            (dev-only; MIT licence)
    python bench/crosscheck_mir_eval.py [bench/out/synthetic/scores.json] [--manifest path/to/manifest.json]

Scorable regions are checked independently: this script applies its OWN half-open [start, end) masks to the reference annotations AND to the
raw predictions (read from predictions.json next to scores.json), instead of trusting the masked data score.js recorded. EVERY evaluated event
list is rebuilt here from the raw predictions: tracked beats and downbeats, the exported grid (own implementation of firstDown + n * barSec / 4),
drum hits, bass notes and chord bars (own app-chord to Harte mapping), then masked by this script's own region and declared-gap filters. Only
if predictions.json is missing does it fall back to the (already filtered) copies in scores.json. An annotated-but-empty class inside a region
must still score its false positives, and a class with nothing annotated and nothing predicted must be "not scored".

All times are shifted by one constant so none is negative (mir_eval rejects negative times); matching-based
scores do not change under a common shift.
"""
import json, math, os, sys, warnings
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

WINDOW = 0.07
def export_grid(full):
    """The grid the app exports: firstDown + n * barSec / 4 (own implementation, same arithmetic order as the app)."""
    fd, bs, dur = full["firstDown"], full["barSec"], full["duration"]
    beats, downs = [], []
    n = math.ceil((-WINDOW - fd) / (bs / 4))
    while fd + n * bs / 4 <= dur:
        t = fd + n * bs / 4; beats.append(t)
        if n % 4 == 0: downs.append(t)
        n += 1
    return np.array(beats), np.array(downs)

def read_gaps(path):
    """Declared 'gap <start> <end> <reason>' spans of a beats file: predictions strictly inside are not scored."""
    out = []
    for line in open(path, encoding="utf-8"):
        w = line.split()
        if w and w[0].lower() == "gap" and len(w) >= 3: out.append((float(w[1]), float(w[2])))
    return out

def outside_gaps(x, gaps):
    x = np.asarray(x, dtype=float)
    if not gaps: return x
    return x[[not any(g[0] < v < g[1] for g in gaps) for v in x]]

def app_chord_to_harte(c):
    return "N" if (not c or c == "\u2013") else (c[:-1] + ":min" if c.endswith("m") else c + ":maj")

def f_or_none(ref, est, tol):
    """mir_eval F, or None when nothing is annotated AND nothing predicted (vacuous: not scored)."""
    if len(ref) == 0 and len(est) == 0: return None
    return mir_eval.onset.f_measure(np.sort(ref), np.sort(est), window=tol)[0]

def get(d, path):
    for k in path.split("."):
        if d is None: return None
        d = d.get(k)
    return d

def regs_for(track, kind):
    return (track.get("scorableByKind") or {}).get(kind) or track.get("scorable")

def read_melody(path):
    """Own parser: onset offset midi [tags]. Returns list of dicts."""
    out = []
    for line in open(path, encoding="utf-8"):
        line = line.split("#")[0].strip()
        if not line: continue
        w = line.replace(",", " ").split()
        out.append({"on": float(w[0]), "off": float(w[1]), "midi": float(w[2]), "tags": [x.lower() for x in w[3:]]})
    return out

def midi_hz(x): return 440.0 * 2.0 ** ((np.asarray(x, dtype=float) - 69.0) / 12.0)

def notes_to_frames(notes, times):
    """Own note-to-frame rule (monophonic: the latest-onset note covering the frame wins). Returns Hz, 0 = unvoiced."""
    f = np.zeros(len(times))
    for n in sorted(notes, key=lambda n: n["on"]):                 # later onsets overwrite earlier ones
        f[(times >= n["on"]) & (times < n["off"])] = midi_hz(n["midi"])
    return f

def candidate_notes(t, kind, raw):
    """The estimated notes, rebuilt from the candidate file (if one was used) or from the raw predictions (the analyzer's hook)."""
    cand = S["meta"].get("candidate")
    if cand:
        l = (json.load(open(os.path.join(ROOT, cand["path"]) if not os.path.isabs(cand["path"]) else cand["path"], encoding="utf-8"))["tracks"].get(t["id"]) or {}).get(kind)
        return None if l is None else [{"on": n["onset"], "off": n["offset"], "midi": n["midi"]} for n in l]
    full, ex = raw.get("full"), raw.get("exported")
    if kind == "melody_lead" and full and ex and ex.get("hook") is not None:
        return [{"on": full["firstDown"] + n["t"] * ex["stepSec"], "off": full["firstDown"] + (n["t"] + n["dur"]) * ex["stepSec"], "midi": n["midi"]} for n in ex["hook"]]
    return None

def crosscheck_melody(t, mm, kind, A, P, track, raw, regs):
    tid = f"{t['id']} {kind}"
    refall = read_melody(P(kind)); est = candidate_notes(t, kind, raw)
    if est is None: return                                       # no prediction supplied for this kind: not evaluated
    inside = lambda x: regs is None or any(g["start"] <= x < g["end"] for g in regs)
    ref = [n for n in refall if inside(n["on"]) and "unpitched" not in n["tags"]]; unp = [n for n in refall if inside(n["on"]) and "unpitched" in n["tags"]]
    est = [n for n in est if inside(n["on"])]
    iv = lambda L: np.array([[n["on"] + 3.0, n["off"] + 3.0] for n in L]).reshape(-1, 2); hz = lambda L: midi_hz([n["midi"] for n in L])   # +3 s: mir_eval rejects negative times; matching is shift-invariant
    if ref and unp:  # estimates that land on an unpitched reference note (and match no pitched one) are ignored
        pre = {j for _, j in mir_eval.transcription.match_note_onsets(iv(ref), iv(est), onset_tolerance=0.05)} if est else set()
        est = [n for j, n in enumerate(est) if j in pre or not any(n["on"] >= u["on"] - 0.05 and n["on"] <= u["off"] for u in unp)]
    same(tid + " nRef", mm["nRef"], len(ref)); same(tid + " nEst", mm["nEst"], len(est))
    if ref and est:
        ri, ei, rh, eh = iv(ref), iv(est), hz(ref), hz(est)
        p, r, f = mir_eval.transcription.onset_precision_recall_f1(ri, ei, onset_tolerance=0.05)
        same(tid + " onset P", get(mm, "onset.P"), p); same(tid + " onset R", get(mm, "onset.R"), r); same(tid + " onset F", get(mm, "onset.F"), f)
        p, r, f, _ = mir_eval.transcription.precision_recall_f1_overlap(ri, rh, ei, eh, onset_tolerance=0.05, pitch_tolerance=50.0, offset_ratio=None)
        same(tid + " pitchOnset P", get(mm, "pitchOnset.P"), p); same(tid + " pitchOnset R", get(mm, "pitchOnset.R"), r); same(tid + " pitchOnset F", get(mm, "pitchOnset.F"), f)
        p, r, f, aor = mir_eval.transcription.precision_recall_f1_overlap(ri, rh, ei, eh, onset_tolerance=0.05, pitch_tolerance=50.0, offset_ratio=0.2, offset_min_tolerance=0.05)
        same(tid + " full P", get(mm, "full.P"), p); same(tid + " full R", get(mm, "full.R"), r); same(tid + " full F", get(mm, "full.F"), f)
        if get(mm, "avgOverlap") is not None: same(tid + " average overlap", get(mm, "avgOverlap"), aor)
    elif not ref and est:
        same(tid + " false positives only: F", get(mm, "pitchOnset.F"), 0.0); same(tid + " fp", get(mm, "pitchOnset.fp"), len(est))
    elif not ref and not est:
        same(tid + " vacuous F is null", get(mm, "pitchOnset.F"), None)
    # frames: own grid, own note-to-frame rule, then mir_eval.melody on the SAME time base (no resampling involved)
    fr = mm.get("frames")
    if fr and fr.get("reference") == "derived from the reference notes":
        full = raw.get("full"); dur = full["duration"]; hop = fr["hop"]
        ks = np.arange(0, int(np.ceil(dur / hop)) + 2); times = ks * hop; times = times[times < dur - 1e-9]
        if regs is not None: times = times[[any(g["start"] <= x < g["end"] for g in regs) for x in times]]
        rf = notes_to_frames(refall, times); ef = notes_to_frames(candidate_notes(t, kind, raw), times)
        same(tid + " frames", fr["frames"], len(times))
        if len(times) and (rf > 0).any():
            r = mir_eval.melody.evaluate(times, rf, times, ef)
            for key, name in [("Voicing Recall", "voicingRecall"), ("Raw Pitch Accuracy", "rawPitchAccuracy"), ("Raw Chroma Accuracy", "rawChromaAccuracy"), ("Overall Accuracy", "overallAccuracy")]:
                same(f"{tid} {name}", fr.get(name), r[key])
            if (rf == 0).any(): same(tid + " voicingFalseAlarm", fr.get("voicingFalseAlarm"), r["Voicing False Alarm"])

for t in S["tracks"]:
    m, inp = t.get("metrics"), t.get("inputs")
    if not m: continue
    A = tracks[t["id"]]["annotations"]; P = lambda k: os.path.join(mdir, A[k])
    # one shift for the whole track, large enough to make every time non-negative
    lows = [0.0] + [min(v) for k, v in inp.items() if isinstance(v, list) and v and isinstance(v[0], (int, float))]
    lows += [min(v) for v in (inp.get("drums") or {}).values() if v] + [s["start"] for s in inp.get("chords") or []][:1] + [n["onset"] for n in inp.get("bass") or []][:1]
    sh = max(0.0, -min(lows)) + 3.0   # a constant shift; raw predictions can start before 0 (firstDown < 0), all metrics are shift-invariant
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
        gaps = read_gaps(P("beats"))
        cut = lambda v: outside_gaps(mask_times(v, regs), gaps)      # this script's own region mask, then declared gaps
        if raw.get("grid") and raw.get("full"):
            trk, trk_d = cut(raw["grid"]["beats"]), cut(raw["grid"]["downbeats"]); eb, ed = export_grid(raw["full"]); exb, exd = cut(eb), cut(ed)
        else: trk, trk_d, exb, exd = (np.asarray(inp[k], dtype=float) for k in ("trackedBeats", "trackedDownbeats", "exportBeats", "exportDownbeats"))
        if len(bt) or len(trk):
            same(f"{t['id']} beats F", get(m, "beats.f"), mir_eval.beat.f_measure(bt, trk + sh, 0.07) if len(bt) and len(trk) else 0.0)
        else: same(f"{t['id']} beats vacuous", get(m, "beats.f"), None)
        if len(bt) and len(exb): same(f"{t['id']} export beats F", get(m, "exportBeats.f"), mir_eval.beat.f_measure(bt, exb + sh, 0.07))
        if down is not None and len(down) and len(trk_d):
            same(f"{t['id']} downbeats F", get(m, "downbeats.f"), mir_eval.beat.f_measure(down, trk_d + sh, 0.07))
            same(f"{t['id']} export downbeats F", get(m, "exportDownbeats.f"), mir_eval.beat.f_measure(down, exd + sh, 0.07))
    if "key" in A and get(m, "key.scorable"):
        same(f"{t['id']} key weighted", get(m, "key.weighted"), mir_eval.key.weighted_score(mir_eval.io.load_key(P("key")), inp["key"]))
    if "chords" in A and inp.get("chords"):
        ri, rl = mir_eval.io.load_labeled_intervals(P("chords"))
        if raw.get("full"):  # one chord per bar on the app's fixed grid, labels mapped by this script
            fd, bs = raw["full"]["firstDown"], raw["full"]["barSec"]; bars = raw["full"]["chords"]["bars"]
            ei = np.array([[fd + i * bs, fd + (i + 1) * bs] for i in range(len(bars))]) + sh; el = [app_chord_to_harte(c) for c in bars]
        else: ei = np.array([[c["start"], c["end"]] for c in inp["chords"]]) + sh; el = [c["label"] for c in inp["chords"]]
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
        if raw.get("full") and raw.get("exported"):  # notes at firstDown + t * stepSec, masked by onset with this script's own regions
            fd, ss = raw["full"]["firstDown"], raw["exported"]["stepSec"]
            E = [{"onset": fd + n["t"] * ss, "offset": fd + (n["t"] + n["dur"]) * ss, "midi": n["midi"]} for n in raw["exported"]["bass"]]
            if regs is not None: E = [n for n in E if any(g["start"] <= n["onset"] < g["end"] for g in regs)]
        else: E = inp["bass"]
        eon = arr([n["onset"] for n in E])
        same(f"{t['id']} bass onset F", get(m, "bass.onset.f"), f_or_none(ri[:, 0] if len(ri) else [], eon, 0.05))
        if len(E) and len(ri):
            ei = np.array([[n["onset"], n["offset"]] for n in E]) + sh; ep = mir_eval.util.midi_to_hz(np.array([n["midi"] for n in E], dtype=float))
            f = mir_eval.transcription.precision_recall_f1_overlap(ri, mir_eval.util.midi_to_hz(np.round(rp)), ei, ep, onset_tolerance=0.05, pitch_tolerance=50.0, offset_ratio=None)[2]
            same(f"{t['id']} bass note F", get(m, "bass.noteF"), f)

    for mk in ("melody_vocal", "melody_lead"):
        if mk in A and (get(m, mk) or {}).get("nRef") is not None:
            crosscheck_melody(t, m[mk], mk, A, P, tracks[t["id"]], raw, regs_for(tracks[t["id"]], mk))

    if "sections" in A and inp.get("sections"):
        ri, _ = mir_eval.io.load_labeled_intervals(P("sections"))
        ei = np.array([[x["start"], x["end"]] for x in inp["sections"]]) + sh
        for w, key in [(0.5, "w05"), (3.0, "w3")]:
            same(f"{t['id']} section boundaries F ±{w}s", get(m, f"sections.{key}.f"), mir_eval.segment.detection(ri + sh, ei, window=w, trim=True)[2])

print(f"mir_eval {mir_eval.__version__} cross-check: {checks - fails}/{checks} values agree within {TOL} ({os.path.relpath(scores_path, ROOT)})")
sys.exit(1 if fails else 0)
