"""Tempo-map fixtures (research issue #57): synthetic songs whose tempo STEPS, RAMPS and RETURNS, plus constant-tempo controls whose rhythmic
feel changes (half-time, double-time fills, off-beat percussion) without any tempo change.
Run:  python3 test-songs/make_tempo_map_fixtures.py        (needs numpy)
Writes test-songs/tempo-map-fixtures/<id>.wav, truth/<id>.* and manifest.json (git-ignored, like the other generated audio).

Reuses the sound recipes and the `build` function of make_time_fixtures.py (that file is not modified: this script reads its source and
runs the parts it needs, with its own output folder and its own seeds). Truth is exact by construction: the beat schedule that places every
sound is the answer. Each fixture also gets truth/<id>.tempomap.json: the regions the tempo function was written from
(startBeat, endBeat, bpm at start, bpm at end), which is what the tempo-map scorer compares a candidate against.

Splits: "dev" fixtures are what candidate settings may be tuned on; "holdout" fixtures use other tempi, other transition positions and a
different seed, and must only be looked at once per candidate, after its settings are frozen (bench/tempo/README.md)."""
import os, sys, json, hashlib
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "tempo-map-fixtures")
SRC = open(os.path.join(HERE, "make_time_fixtures.py"), encoding="utf-8").read().split("\n")
mark = lambda s: next(i for i, l in enumerate(SRC) if l.startswith(s))
ns = {"__file__": os.path.join(HERE, "make_time_fixtures.py"), "__name__": "tempo_map_fixtures"}
prefix = "\n".join(SRC[:mark("F = []")]).replace('OUT = os.path.join(HERE, "time-fixtures")', f'OUT = {OUT!r}')
# key-change fixtures: `build` reads the chord of each bar from PROG; let it be shifted per bar (KSHIFT) without editing make_time_fixtures.py
assert "ch = PROG[b % 4]" in prefix
prefix = prefix.replace("ch = PROG[b % 4]", "ch = [m + KSHIFT(b) for m in PROG[b % 4]]")
prefix = "KSHIFT = lambda b: 0\n" + prefix
defs = "\n".join(SRC[mark("f6 = lambda"):mark("write_set(F,")])
exec(compile(prefix, "make_time_fixtures(prefix)", "exec"), ns)
exec(compile(defs, "make_time_fixtures(write_set)", "exec"), ns)
build, tags, write_set, FEEL = ns["build"], ns["tags"], ns["write_set"], ns["FEEL"]

# extra rhythmic feels (the existing ones are in make_time_fixtures.FEEL)
FEEL["fills"] = dict(kick=[0, 2, 2.5], snare=[1, 3, 3.25, 3.5, 3.75], hat=[i * 0.25 for i in range(16)])        # double-time snare roll at the end of each bar
FEEL["offbeat"] = dict(kick=[0.5, 2.5], snare=[1.5, 3.5], hat=[0.5, 1.5, 2.5, 3.5])                              # every drum hit on an off-beat: the beat is only in the pad and bass

def tempo_fn(regions):
    """regions: [(startBeat, endBeat, bpmStart, bpmEnd)] covering beats 0..N; the bpm in force from beat k to k+1, linear inside a region."""
    def f(k):
        for a, b, b0, b1 in regions:
            if a <= k < b: return b0 + (b1 - b0) * (k - a) / (b - a)
        a, b, b0, b1 = regions[-1]; return b1
    return f

DRUMLESS = dict(kick=0, snare=0, hat=0, pad=1, bass=1)   # a breakdown: only pad and bass (one onset per bar each)
def mix_drumless(bars):  return lambda b: DRUMLESS if b in bars else dict(kick=1, snare=1, hat=1, pad=1, bass=1)

def make(fid, split, regions, bars, feel="4/4", bar_feel=None, bar_mix=None, kind="", note=""):
    fn = tempo_fn(regions)
    steady = len(regions) == 1 or all(r[2] == r[3] for r in regions) and len({r[2] for r in regions}) == 1
    T = build(fid, 4, bars, fn, feel, bar_feel=bar_feel, bar_mix=bar_mix, declare_tempo=regions[0][2] if steady else None,
              tempo_notes=[(r[0], f"{prev[3]:g} -> {r[3]:g} BPM") for prev, r in zip(regions, regions[1:]) if prev[3] != r[3] or r[2] != r[3]],
              tags=tags(tempo_behaviour=kind, split=split, notes=note, tempo_octave="clear"))
    T["split"] = split; T["regions"] = regions
    return T

S = lambda a, b, bpm: (a, b, bpm, bpm)          # a steady region
R = lambda a, b, b0, b1: (a, b, b0, b1)         # a ramp region
F = []

def fixtures(split, seed, bpms):
    """One set of fixtures. `bpms` picks the tempi (they differ between dev and holdout)."""
    ns["rng"] = np.random.default_rng(seed)            # the sounds' noise (kick click, clap, hats) is seeded per split
    p = split[:3] + "_"
    lo, hi, lo2, hi2 = bpms["lo"], bpms["hi"], bpms["lo2"], bpms["hi2"]
    out = []
    # 1. a step between two steady tempi (an abrupt tempo change at a bar line)
    out.append(make(p + "step", split, [S(0, 64, lo), S(64, 128, hi)], 32, kind=f"step {lo:g} to {hi:g} BPM at bar 17"))
    # 2. the producer-report shape: house, a drumless breakdown that accelerates, a half-time drop at the new tempo
    out.append(make(p + "init_like", split, [S(0, 48, lo), R(48, 80, lo, hi), S(80, 144, hi)], 36, bar_feel=lambda b: "halftime" if b >= 20 else "4/4",
                    bar_mix=mix_drumless(range(12, 20)), kind=f"house {lo:g}, drumless ramp {lo:g} to {hi:g} over bars 13-20, half-time drop at {hi:g}"))
    # 3. a gradual ramp with drums throughout
    out.append(make(p + "ramp", split, [S(0, 32, lo), R(32, 64, lo, hi), S(64, 96, hi)], 24, kind=f"ramp {lo:g} to {hi:g} over bars 9-16, drums throughout"))
    # 4. there and back: A -> B -> A
    out.append(make(p + "aba", split, [S(0, 48, lo), S(48, 96, hi), S(96, 144, lo)], 36, kind=f"{lo:g} -> {hi:g} -> {lo:g} BPM, 12 bars each"))
    # 5. several changes, steps and a ramp
    out.append(make(p + "multi", split, [S(0, 32, lo2), S(32, 64, lo), S(64, 96, hi2), R(96, 112, hi2, hi), S(112, 144, hi)], 36,
                    kind=f"{lo2:g} -> {lo:g} -> {hi2:g} steps, then a 4-bar ramp to {hi:g}"))
    # 6. constant-tempo controls: the feel changes, the tempo does not
    out.append(make(p + "const", split, [S(0, 128, bpms["c0"])], 32, kind="constant (control)"))
    out.append(make(p + "halftime_drop", split, [S(0, 128, bpms["c1"])], 32, bar_feel=lambda b: "halftime" if b >= 16 else "4/4", kind=f"constant {bpms['c1']:g}; half-time feel from bar 17 (control)"))
    out.append(make(p + "offbeat", split, [S(0, 128, bpms["c2"])], 32, feel="offbeat", kind=f"constant {bpms['c2']:g}; all drums on off-beats (control)"))
    return out

DEV = dict(lo=128, hi=150, lo2=100, hi2=140, c0=128, c1=150, c2=140)
HOLD = dict(lo=100, hi=132, lo2=90, hi2=118, c0=132, c1=166, c2=122)
F += fixtures("dev", 20261121, DEV)
# dev only: transition-length and unobservable-transition cases
ns["rng"] = np.random.default_rng(20261121)
F.append(make("dev_ramp_short", "dev", [S(0, 48, 120), R(48, 56, 120, 140), S(56, 104, 140)], 26, kind="ramp 120 to 140 over 2 bars (short transition)"))
F.append(make("dev_ramp_long", "dev", [S(0, 16, 110), R(16, 80, 110, 140), S(80, 96, 140)], 24, kind="ramp 110 to 140 over 16 bars (long transition)"))
F.append(make("dev_silent_step", "dev", [S(0, 48, 120), S(48, 96, 135), S(96, 128, 135)], 32, bar_mix=mix_drumless(range(10, 26)),
              kind="step 120 to 135 inside a 16-bar drumless section (the exact place is unobservable)"))
# dev only, added after the first holdout run showed octave errors on slow tempi (the holdout's 87 and 90 BPM stretches were read at double): slow constant and slow step cases
F.append(make("dev_slow_fills", "dev", [S(0, 128, 92)], 32, bar_feel=lambda b: "fills" if b >= 16 else "4/4", kind="constant 92; double-time snare rolls and 16th hats from bar 17 (control)"))
F.append(make("dev_slow_step", "dev", [S(0, 64, 88), S(64, 128, 98)], 32, kind="step 88 to 98 BPM at bar 17 (slow tempi, a 11 % step)"))
# ---- key fixtures (issue #57, "local keys / modulations"): constant tempo 128, 32 bars, the chord progression moved to another key at bar 17 (or not at all)
KEYS = {}        # fixture id -> [(startBar, endBar, "A minor")]
NOTE12 = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
def make_key(fid, split, shift_at, shift, prog=None, key0="A minor", note=""):
    ns["KSHIFT"] = lambda b: shift if (shift_at is not None and b >= shift_at) else 0
    keep = ns["PROG"]
    if prog is not None: ns["PROG"] = prog
    T = make(fid, split, [S(0, 128, 128)], 32, kind="constant 128 (key fixture)", note=note); ns["KSHIFT"] = lambda b: 0; ns["PROG"] = keep   # restore: the tempo fixtures must not change
    tonic, mode = key0.split(); t0 = NOTE12.index(tonic)
    segs = [(0, shift_at if shift_at is not None else 32, key0)] + ([(shift_at, 32, NOTE12[(t0 + shift) % 12] + " " + mode)] if shift_at is not None else [])
    KEYS[fid] = segs; return T
PROG_AM = [[57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64]]          # Am Dm E Am (the default: unambiguous A minor)
PROG_C = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]           # C Am F G: C major and its relative A minor are both defensible
ns["rng"] = np.random.default_rng(20261121)
F.append(make_key("dev_key_const", "dev", None, 0, PROG_AM, "A minor", "key control: no modulation"))
F.append(make_key("dev_key_up2", "dev", 16, 2, PROG_AM, "A minor", "A minor to B minor (up a whole tone) at bar 17"))
F.append(make_key("dev_key_up4", "dev", 16, 4, PROG_AM, "A minor", "A minor to C# minor (up a major third) at bar 17"))
F.append(make_key("dev_key_relative", "dev", None, 0, PROG_C, "C major", "key control: C Am F G, C major or A minor are both defensible (relative-key ambiguity)"))
F += fixtures("holdout", 20261122, HOLD)
F.append(make("holdout_dnb_double", "holdout", [S(0, 128, 87)], 32, bar_feel=lambda b: "fills" if b >= 16 else "4/4", kind="constant 87; double-time snare rolls from bar 17 (control)"))

ns["rng"] = np.random.default_rng(20261122)
F.append(make_key("hold_key_const", "holdout", None, 0, PROG_AM, "A minor", "key control: no modulation"))
F.append(make_key("hold_key_up3", "holdout", 12, 3, PROG_AM, "A minor", "A minor to C minor (up a minor third) at bar 13"))
F.append(make_key("hold_key_up5", "holdout", 20, 5, PROG_AM, "A minor", "A minor to D minor (up a fourth) at bar 21"))
os.chdir(OUT)
write_set(F, "tempo-map-fixtures", 1,
          "Generated answers, exact by construction (test-songs/make_tempo_map_fixtures.py). Tempo steps, ramps and returns, plus constant-tempo controls whose feel changes. Research (#57): reported, not gated. Not real-world accuracy.",
          "tempo-map fixtures v1", ["beats", "downbeats", "key", "chords", "drums"])
man = json.load(open("manifest.json"))
for tr, T in zip(man["tracks"], F):
    tr["tags"]["tempo_map_split"] = T["split"]      # tr["split"] stays "synthetic": the repo's own holdout custody (bench/run.js --holdout) is for real recordings
    path = f"truth/{T['id']}.tempomap.json"
    with open(path, "w", newline="\n") as f:
        json.dump({"regions": [{"startBeat": a, "endBeat": b, "bpmStart": b0, "bpmEnd": b1} for a, b, b0, b1 in T["regions"]]}, f, indent=1)
    tr["annotations"]["tempomap"] = path
    tr["annotationSha256"]["tempomap"] = hashlib.sha256(open(path, "rb").read()).hexdigest()
    if T["id"] in KEYS:
        kp = f"truth/{T['id']}.keymap.json"
        with open(kp, "w", newline="\n") as f: json.dump({"segments": [{"startBar": a, "endBar": b, "key": k} for a, b, k in KEYS[T["id"]]]}, f, indent=1)
        tr["annotations"]["keymap"] = kp; tr["annotationSha256"]["keymap"] = hashlib.sha256(open(kp, "rb").read()).hexdigest()
# two manifests, so a candidate is tuned on one and only then looked at on the other
isKey = lambda T: T["id"] in KEYS          # key fixtures have their own manifest: the tempo manifests stay exactly the tempo fixtures
for name, split, fn in (("tempo-map-fixtures-dev", "dev", "manifest.json"), ("tempo-map-fixtures-holdout", "holdout", "manifest-holdout.json")):
    json.dump({**man, "name": name, "tracks": [t for t, T in zip(man["tracks"], F) if T["split"] == split and not isKey(T)]}, open(fn, "w", newline="\n"), indent=1)
json.dump({**man, "name": "tempo-map-fixtures-key", "tracks": [t for t, T in zip(man["tracks"], F) if isKey(T)]}, open("manifest-key.json", "w", newline="\n"), indent=1)
print("ok", len(F), "tempo-map fixtures:", ", ".join(T["id"] for T in F))
