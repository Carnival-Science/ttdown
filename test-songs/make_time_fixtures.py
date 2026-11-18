"""Time-model fixtures: synthetic songs whose beat structure is NOT a constant-tempo 4/4 loop from 0:00.
Run:  python3 test-songs/make_time_fixtures.py        (needs numpy)
Writes test-songs/time-fixtures/<id>.wav, truth/<id>.* annotation files and manifest.json for the bench/ harness.

Why a separate generator: test-songs/make_test_songs.py is the regression/tuning set (constant tempo, 4/4, starts on the beat) and its
bytes must not change. These fixtures exist to expose what that set cannot (leading silence, pickups, half/double-time ambiguity,
drift, tempo changes, other meters, a long recording). They use their own random seed, were never used to tune any threshold, and
the analyzer is NOT expected to pass all of them: they are reported, not gated (see docs/TIME_FIXTURES_BASELINE.md).

Answers are computed from the same beat schedule that places every sound, at the same sample instants, so they cannot drift from the
audio. Events between beats sit at the linear interpolation of the surrounding beat times."""
import os, json, hashlib, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "time-fixtures")
os.makedirs(os.path.join(OUT, "truth"), exist_ok=True); os.chdir(OUT)
SR = 44100; SEED = 20261117; NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
rng = np.random.default_rng(SEED)

# ---- sounds (same recipes as the regression songs, mono) ----
tk = np.arange(int(0.35 * SR)) / SR
KICK = np.sin(2 * np.pi * (45 * tk + (110 / 30) * (1 - np.exp(-30 * tk)))) * np.exp(-tk * 9) * 0.9 + rng.standard_normal(len(tk)) * np.exp(-tk * 900) * 0.25
tc = np.arange(int(0.2 * SR)) / SR
_nz = rng.standard_normal(len(tc)); _F = np.fft.rfft(_nz); _fr = np.fft.rfftfreq(len(tc), 1 / SR)
_F *= np.exp(-0.5 * ((np.log2(np.maximum(_fr, 1) / 2500)) / 1.6) ** 2); _nz = np.fft.irfft(_F, len(tc)); _nz /= np.max(np.abs(_nz))
CLAP = (_nz * (np.exp(-tc * 30) + 0.6 * np.exp(-np.maximum(0, tc - 0.011) * 120) * (tc > 0.011) + 0.5 * np.exp(-np.maximum(0, tc - 0.022) * 120) * (tc > 0.022))
        + np.sin(2 * np.pi * 200 * tc) * np.exp(-tc * 40) * 0.3) * 0.6
th = np.arange(int(0.05 * SR)) / SR
_hn = rng.standard_normal(len(th)); _H = np.fft.rfft(_hn); _H *= (np.fft.rfftfreq(len(th), 1 / SR) > 6500); _hn = np.fft.irfft(_H, len(th)); _hn /= np.max(np.abs(_hn))
HAT = _hn * np.exp(-th * 70) * 0.22

def tone(m, length, amp, harm=4):
    t = np.arange(int(length * SR)) / SR; f = 440 * 2 ** ((m - 69) / 12)
    return sum(np.sin(2 * np.pi * f * h * t) / h for h in range(1, harm + 1)) * np.minimum(1, t / 0.02) * np.exp(-t * 0.8) * amp
def bass(m, length):
    t = np.arange(int(length * SR)) / SR; f = 440 * 2 ** ((m - 69) / 12)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * np.minimum(1, t / 0.003) * np.exp(-t * 2.2) * 0.4

# patterns: positions in beats within a bar, per class
FEEL = {
    "4/4":      dict(kick=[0, 2, 2.5], snare=[1, 3], hat=[i * 0.5 for i in range(8)]),
    "halftime": dict(kick=[0, 2.5],    snare=[2],    hat=[i * 0.5 for i in range(8)]),   # kick on 1, snare on 3: reads as half the tempo
    "dnb":      dict(kick=[0, 2.5],    snare=[1, 3], hat=[i * 0.5 for i in range(8)]),   # 2-step breakbeat; reads as half the tempo
    "3/4":      dict(kick=[0],         snare=[1, 2], hat=[i * 0.5 for i in range(6)]),
    "5/4":      dict(kick=[0, 3],      snare=[2, 4], hat=[i * 0.5 for i in range(10)]),
}
PROG = [[57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64]]  # Am Dm E Am: the major E chord (G#) makes A minor unambiguous (Am F C G would also read as C major)

def build(fid, meter, bars, tempo, feel, t0=0.0, pickup=0, tags=None, tempo_notes=(), declare_tempo=None, bar_feel=None):
    """tempo: function beat_index -> bpm in force from that beat to the next. bar_feel: optional function bar -> feel name."""
    nb = pickup + bars * meter + 1                      # one extra beat so every position has a following beat
    bt = np.zeros(nb); bt[0] = t0
    for k in range(nb - 1): bt[k + 1] = bt[k] + 60.0 / tempo(k)
    dur = bt[-1] + 1.0; n = int(SR * dur) + 1; x = np.zeros(n)
    at = lambda t: int(t * SR) / SR                      # sounds are placed at the floor sample; answers use the same instant
    def time_at(q):                                      # q in beats relative to bar 0 beat 1
        k = q + pickup; i = int(np.floor(k)); f = k - i
        return bt[i] if f == 0 else bt[i] + f * (bt[i + 1] - bt[i])
    def add(sig, t):
        i = int(t * SR); j = min(n, i + len(sig))
        if i < n: x[i:j] += sig[:j - i]
    T = {"beats": [], "chords": [], "drums": [], "tempo_changes": list(tempo_notes), "tags": tags or {}}
    for k in range(nb - 1):                              # annotated beats (the last helper beat is not music)
        q = k - pickup; T["beats"].append((at(bt[k]), int(q % meter) + 1))
    hits = []                                            # (time, class)
    for b in range(-1 if pickup else 0, bars):
        f = FEEL[bar_feel(b) if bar_feel else feel]
        for cls in ("kick", "snare", "hat"):
            for p in f[cls]:
                q = b * meter + p
                if q >= meter * bars or p >= meter: continue
                if b < 0:                                # pickup bar: only its last `pickup` beats sound, hats plus a clap on the last one
                    if q < -pickup: continue
                    if cls == "hat" or (cls == "snare" and q >= -1): hits.append((time_at(q), cls))
                else: hits.append((time_at(q), cls))
    for t, cls in hits:
        add({"kick": KICK, "snare": CLAP, "hat": HAT}[cls], t)
        T["drums"].append((at(t), {"hat": "hihat"}.get(cls, cls)))
    for b in range(bars):
        ch = PROG[b % 4]; s0, s1 = time_at(b * meter), time_at((b + 1) * meter)
        for m in ch: add(tone(m, (s1 - s0), 0.08, 5), s0)
        add(bass(ch[0] - 24, (s1 - s0) * 0.9), s0)
        T["chords"].append((at(s0), at(s1), NOTE[ch[0] % 12] + ":min" if ch[1] - ch[0] == 3 else NOTE[ch[0] % 12] + ":maj"))
    x /= np.max(np.abs(x)) * 1.05
    y = (x * 32767).astype(np.int16)
    with wave.open(fid + ".wav", "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
    T["drums"].sort(); T["tempo"] = declare_tempo; T["meter"] = meter; T["dur"] = dur; T["id"] = fid
    return T

const = lambda bpm: (lambda k: bpm)
def ramp(b0, b1, beats): return lambda k: b0 + (b1 - b0) * min(k, beats) / beats
def step(b0, b1, at_beat): return lambda k: b0 if k < at_beat else b1

def tags(**kw):
    base = {"style": "synthetic time-model fixture", "swing": "none", "four_on_floor": False, "bass": "root on bar start", "intro_silence": "none",
            "meter": "4/4", "tempo_behaviour": "constant", "pickup": "none", "tempo_octave": "clear"}
    base.update({k: str(v) for k, v in kw.items()}); return base

F = []
F.append(build("leading_silence_2s", 4, 24, const(120), "4/4", t0=2.0, declare_tempo=120, tags=tags(intro_silence="2000 ms")))
F.append(build("pickup_1beat", 4, 24, const(120), "4/4", t0=0.0, pickup=1, declare_tempo=120, tags=tags(pickup="1 beat (beat 4 of bar 0)")))
F.append(build("pickup_2beats_late", 4, 24, const(118), "4/4", t0=1.2, pickup=2, declare_tempo=118, tags=tags(pickup="2 beats (beats 3 and 4 of bar 0)", intro_silence="1200 ms")))
F.append(build("halftime_140", 4, 28, const(140), "halftime", declare_tempo=140, tags=tags(tempo_octave="ambiguous: half-time feel at 140 (reads as 70)", tempo_band="135-160")))
F.append(build("dnb_174", 4, 40, const(174), "dnb", declare_tempo=174, tags=tags(style="breakbeat", tempo_octave="ambiguous: 2-step at 174 (reads as 87)", tempo_band=">160")))
F.append(build("drift_slow", 4, 28, ramp(120, 121, 112), "4/4", tags=tags(tempo_behaviour="drift: 120 to 121 BPM (0.8 %)")))
F.append(build("drift_fast", 4, 28, ramp(120, 108, 112), "4/4", tags=tags(tempo_behaviour="drift: 120 to 108 BPM (10 %)")))
F.append(build("tempo_change_step", 4, 28, step(120, 150, 64), "4/4", tempo_notes=[(64, "120 -> 150 BPM")], tags=tags(tempo_behaviour="step change 120 to 150 BPM at bar 17")))
F.append(build("halftime_breakdown", 4, 32, lambda k: 128 if (k < 64 or k >= 80) else 64, "4/4", tempo_notes=[(64, "128 -> 64 BPM breakdown"), (80, "64 -> 128 BPM")],
               bar_feel=lambda b: "halftime" if 16 <= b < 20 else "4/4", tags=tags(tempo_behaviour="half-time breakdown (128 -> 64 -> 128 BPM), bars 17 to 20")))
F.append(build("meter_3_4", 3, 36, const(120), "3/4", declare_tempo=120, tags=tags(meter="3/4")))
F.append(build("meter_5_4", 5, 24, const(140), "5/4", declare_tempo=140, tags=tags(meter="5/4", tempo_band="135-160")))
F.append(build("long_7min", 4, 224, const(128), "4/4", declare_tempo=128, tags=tags(duration="7:00 (896 beats), the longest the page accepts (8:00)")))

# ---- answers as annotation files + manifest (same formats as make_test_songs.py) ----
f6 = lambda v: f"{v:.6f}"
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
band = lambda bpm: "<90" if bpm < 90 else "90-115" if bpm < 115 else "115-135" if bpm < 135 else "135-160" if bpm < 160 else ">160"
tracks = []
for T in F:
    tid = T["id"]; base = f"truth/{tid}"; W = lambda p: open(p, "w", newline="\n")
    bt = T["beats"]
    with W(f"{base}.beats.txt") as f:
        for i, (t, q) in enumerate(bt): f.write(f"{f6(t)}\t{q}\n")
        for kbeat, note in T["tempo_changes"]: f.write(f"tempo-change {f6(bt[kbeat][0])} {note}\n")
    with W(f"{base}.key.txt") as f: f.write("A minor\n")
    with W(f"{base}.chords.lab") as f: f.writelines(f"{f6(a)}\t{f6(b)}\t{l}\n" for a, b, l in T["chords"])
    with W(f"{base}.drums.txt") as f: f.writelines(f"{f6(t)}\t{c}\n" for t, c in T["drums"])
    ann = {k: f"{base}.{ext}" for k, ext in [("beats", "beats.txt"), ("key", "key.txt"), ("chords", "chords.lab"), ("drums", "drums.txt")]}
    iv = np.diff([t for t, _ in bt]); med_bpm = 60.0 / float(np.median(iv))
    tr = {"id": tid, "audio": f"{tid}.wav", "sha256": sha(f"{tid}.wav"), "split": "synthetic",
          "artists": ["Track Teardown time-model fixtures"], "release": "time fixtures v1", "songFamily": tid,
          "rights": {"source": "generated by test-songs/make_time_fixtures.py", "licence": "project-owned synthetic audio"},
          "tags": {**T["tags"], "tempo_band": band(med_bpm)}, "annotations": ann, "annotationSha256": {k: sha(p) for k, p in ann.items()}}
    if T["tempo"] is not None: tr["tempo"] = T["tempo"]   # variable-tempo fixtures have no single tempo: the harness derives one from the beats
    tracks.append(tr)
with open("manifest.json", "w", newline="\n") as f:
    json.dump({"name": "time-fixtures", "version": 2, "annotationProtocol": "synthetic-exact",
               "note": "Generated answers, exact by construction. Time-model stress fixtures: reported, not gated. Not real-world accuracy.",
               "requirements": {"checksums": True, "continuousBeats": True, "identity": True,
                                "annotations": {k: "all" for k in ["beats", "downbeats", "key", "chords", "drums"]}},
               "tracks": tracks}, f, indent=1)
print("ok", len(F), "fixtures")
