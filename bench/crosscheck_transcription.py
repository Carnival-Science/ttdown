"""Independent check of bench/lib/transcription.js against mir_eval, on the adversarial fixtures and N seeded random cases.

    node bench/lib/transcription-cli.js --random 300      (called by this script)
    python bench/crosscheck_transcription.py [N]          N random cases (default 300); exits 1 on any value that differs by more than 0.001

For every case the JS scorer's note scores (onset-only, onset+pitch, onset+pitch+offset, average overlap) are compared with
mir_eval.transcription, and its frame scores (voicing recall and false alarm, raw pitch, raw chroma, overall accuracy) with mir_eval.melody.
This script has its OWN note-to-frame rule, its own region masking and its own unpitched-note handling, and feeds mir_eval the same time
base for reference and estimate (no resampling). Degenerate cases (nothing on one side) follow bench/lib/transcription.js: vacuous is null,
predictions against an empty annotation are false positives.
"""
import json, os, subprocess, sys, warnings
import numpy as np
import mir_eval

warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
N = int(sys.argv[1]) if len(sys.argv) > 1 else 300
cases = json.loads(subprocess.run(["node", os.path.join(ROOT, "bench", "lib", "transcription-cli.js"), "--random", str(N)], capture_output=True, text=True, check=True, cwd=ROOT).stdout)
TOL, checks, fails = 1e-3, 0, 0

def same(what, ours, theirs):
    global checks, fails
    checks += 1
    if ours is None and theirs is None: return
    if ours is None or theirs is None or abs(float(ours) - float(theirs)) > TOL:
        fails += 1; print(f"MISMATCH {what}: ours {ours} vs mir_eval {theirs}")

hz = lambda m: 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)
SHIFT = 3.0   # mir_eval rejects negative times; every metric here is shift-invariant
def iv(L): return np.array([[n["onset"] + SHIFT, n["offset"] + SHIFT] for n in L]).reshape(-1, 2)
def tags(n): return n.get("tags") or []

def frames(notes, times):
    f = np.zeros(len(times))
    for n in sorted(notes, key=lambda n: n["onset"]): f[(times >= n["onset"]) & (times < n["offset"])] = hz(n["midi"])
    return f

def series_frames(series, times):
    t = np.array([s["t"] for s in series]); h = np.array([s["hz"] for s in series]); order = np.argsort(t); t, h = t[order], h[order]
    sp = np.median(np.diff(t)) if len(t) > 1 else 0.01; out = np.zeros(len(times))
    for i, x in enumerate(times):
        j = np.searchsorted(t, x + 1e-12, side="right") - 1
        out[i] = h[j] if j >= 0 and x - t[j] <= 2.5 * sp and h[j] > 0 else 0
    return out

for c in cases:
    tid, regs = c["name"][:48], c["regions"]
    inside = (lambda x: True) if not regs else (lambda x: any(g["start"] <= x < g["end"] for g in regs))
    refall = c["ref"]["notes"] if isinstance(c["ref"], dict) and "notes" in c["ref"] else (None if isinstance(c["ref"], dict) else c["ref"])
    if refall is not None and c["ns"] is not None:
        ref = [n for n in refall if inside(n["onset"]) and "unpitched" not in tags(n)]; unp = [n for n in refall if inside(n["onset"]) and "unpitched" in tags(n)]
        est = [n for n in c["est"] if inside(n["onset"])]
        if ref and unp and est:   # estimates on an unpitched reference note (matching no pitched one) are ignored
            pre = {j for _, j in mir_eval.transcription.match_note_onsets(iv(ref), iv(est), onset_tolerance=0.05)}
            est = [n for j, n in enumerate(est) if j in pre or not any(u["onset"] - 0.05 <= n["onset"] <= u["offset"] for u in unp)]
        ns = c["ns"]; same(tid + " nRef", ns["nRef"], len(ref)); same(tid + " nEst", ns["nEst"], len(est))
        if ref and est:
            ri, ei, rh, eh = iv(ref), iv(est), hz([n["midi"] for n in ref]), hz([n["midi"] for n in est])
            p, r, f = mir_eval.transcription.onset_precision_recall_f1(ri, ei, onset_tolerance=0.05)
            same(tid + " onset P", ns["onset"]["P"], p); same(tid + " onset R", ns["onset"]["R"], r); same(tid + " onset F", ns["onset"]["F"], f)
            p, r, f, _ = mir_eval.transcription.precision_recall_f1_overlap(ri, rh, ei, eh, onset_tolerance=0.05, pitch_tolerance=50.0, offset_ratio=None)
            same(tid + " pitchOnset P", ns["pitchOnset"]["P"], p); same(tid + " pitchOnset R", ns["pitchOnset"]["R"], r); same(tid + " pitchOnset F", ns["pitchOnset"]["F"], f)
            p, r, f, aor = mir_eval.transcription.precision_recall_f1_overlap(ri, rh, ei, eh, onset_tolerance=0.05, pitch_tolerance=50.0, offset_ratio=0.2, offset_min_tolerance=0.05)
            same(tid + " full P", ns["full"]["P"], p); same(tid + " full R", ns["full"]["R"], r); same(tid + " full F", ns["full"]["F"], f)
            # The average overlap ratio depends on WHICH of several equally large matchings is chosen, and mir_eval's matcher and ours may pick
            # different ones: it is informational. What is checked: it is a valid ratio, and exists exactly when mir_eval also found matches.
            same(tid + " average overlap exists", 1 if ns["avgOverlap"] is not None else 0, 1 if aor > 0 or round(r * len(ref)) > 0 else 0)
            if ns["avgOverlap"] is not None: same(tid + " average overlap in [0,1]", 1 if 0 < ns["avgOverlap"] <= 1 else 0, 1)
        elif not ref and est: same(tid + " fp-only F", ns["pitchOnset"]["F"], 0.0); same(tid + " fp-only fp", ns["onset"]["fp"], len(est))
        elif not ref and not est: same(tid + " vacuous F", ns["pitchOnset"]["F"], None)
        elif ref and not est: same(tid + " miss-only F", ns["pitchOnset"]["F"], 0.0)
    # frames, on one shared grid
    fr, dur, hop = c["fr"], c["dur"], c["fr"]["hop"]
    times = np.arange(0, int(np.ceil(dur / hop)) + 2) * hop; times = times[times < dur - 1e-9]
    if regs: times = times[[any(g["start"] <= x < g["end"] for g in regs) for x in times]]
    rf = series_frames(c["ref"]["series"], times) if isinstance(c["ref"], dict) and "series" in c["ref"] else frames(refall, times)
    ef = frames(c["est"], times); same(tid + " frames", fr["frames"], len(times))
    if len(times) and (rf > 0).any():
        r = mir_eval.melody.evaluate(times, rf, times, ef)
        for key, name in [("Voicing Recall", "voicingRecall"), ("Raw Pitch Accuracy", "rawPitchAccuracy"), ("Raw Chroma Accuracy", "rawChromaAccuracy"), ("Overall Accuracy", "overallAccuracy")]:
            same(f"{tid} {name}", fr[name], r[key])
        if (rf == 0).any(): same(tid + " voicingFalseAlarm", fr["voicingFalseAlarm"], r["Voicing False Alarm"])
    elif len(times): same(tid + " no voiced reference: RPA null", fr["rawPitchAccuracy"], None)

print(f"mir_eval {mir_eval.__version__} transcription/melody cross-check: {checks - fails}/{checks} values agree within {TOL} ({len(cases)} cases, {sum(c['source'] == 'random' for c in cases)} random)")
sys.exit(1 if fails else 0)
