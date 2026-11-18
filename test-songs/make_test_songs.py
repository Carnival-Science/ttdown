"""Makes the synthetic test songs (known tempo, key, drums, chords, bass) used by tests/benchmark.js,
and writes their answers as annotation files plus manifest.json for the G1 harness (bench/).
Run:  python test-songs/make_test_songs.py
The answers are computed from the same parameters and sample positions that place each sound, so they
cannot drift from the audio. Writing them uses no random numbers, so the audio is unchanged."""
import os, hashlib, json; os.chdir(os.path.dirname(os.path.abspath(__file__)))
NOTE = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
TRUTH = {}  # track id -> answers, filled in by song()

def e808(m,length):
    t=np.arange(int(length*SR))/SR; f=440*2**((m-69)/12)
    ph=2*np.pi*(f*t+ (f*1.0/60)*(1-np.exp(-60*t)))
    s=np.sin(ph)+0.25*np.sin(2*ph); env=np.minimum(1,t/0.003)*np.exp(-t*2.2); return s*env*0.45
import numpy as np, wave, sys
SR=44100
def song(bpm, key_root_midi, minor, kick, clap, hats, prog, fname, dur=70, swing=0.0, ghost=(), lead=None, bassline=None, tags=None):
    n=int(SR*dur); x=np.zeros(n)
    T = {"bpm": bpm, "key": NOTE[key_root_midi % 12] + (" minor" if minor else " major"), "beats": [], "chords": [], "drums": [], "bass": [], "melody_lead": [], "tags": tags or {}}
    at = lambda t: int(t*SR)/SR  # add() places sounds at the floor sample; answers use the same instant
    step=60/bpm/4; rng=np.random.default_rng(1)
    def add(sig,t):
        i=int(t*SR); j=min(n,i+len(sig)); 
        if i<n: x[i:j]+=sig[:j-i]
    from numpy.fft import rfft, irfft
    tk=np.arange(int(0.35*SR))/SR
    kickS=np.sin(2*np.pi*(45*tk+ (110/30)*(1-np.exp(-30*tk))))*np.exp(-tk*9)*0.9; ck=rng.standard_normal(len(tk))*np.exp(-tk*900)*0.25; kickS=kickS+ck
    tc=np.arange(int(0.2*SR))/SR
    from numpy.fft import rfft, irfft
    nz=rng.standard_normal(len(tc)); F=rfft(nz); fr=np.fft.rfftfreq(len(tc),1/SR); F*=np.exp(-0.5*((np.log2(np.maximum(fr,1)/2500))/1.6)**2); nz=irfft(F,len(tc)); nz/=np.max(np.abs(nz))
    envc=np.exp(-tc*30)+0.6*np.exp(-np.maximum(0,tc-0.011)*120)*(tc>0.011)+0.5*np.exp(-np.maximum(0,tc-0.022)*120)*(tc>0.022)
    body=np.sin(2*np.pi*200*tc)*np.exp(-tc*40)*0.3
    clapS=(nz*envc+body)*0.6
    th=np.arange(int(0.05*SR))/SR
    hn=rng.standard_normal(len(th)); Hf=rfft(hn); hf=np.fft.rfftfreq(len(th),1/SR); Hf*=(hf>6500); hn=irfft(Hf,len(th)); hn/=np.max(np.abs(hn)); hatS=hn*np.exp(-th*70)*0.22
    def tone(m,length,amp,harm=4):
        t=np.arange(int(length*SR))/SR; f=440*2**((m-69)/12)
        s=sum(np.sin(2*np.pi*f*h*t)/h for h in range(1,harm+1))
        env=np.minimum(1,t/0.02)*np.exp(-t*0.8); return s*env*amp
    bars=int(dur/(step*16))
    for b in range(bars):
        t0=b*16*step
        for q in range(4): T["beats"].append((at(t0+q*4*step), q+1))
        for s_ in range(16):
            t=t0+s_*step+(swing*step if s_%2 else 0)
            if s_ in kick:
                add(kickS,t); T["drums"].append((at(t), "kick"))
                if not bassline:
                    add(tone(key_root_midi-24+ (0),step*6,0.35,1),t)  # 808 on root
                    T["bass"].append((at(t), at(t)+step*6, key_root_midi-24))
            if s_ in clap: add(clapS,t); T["drums"].append((at(t), "snare"))
            if s_ in ghost: add(clapS*0.3,t); T["drums"].append((at(t), "snare"))
            if s_ in hats: add(hatS*(1 if s_%4==0 else 0.6),t); T["drums"].append((at(t), "hihat"))
        if lead:
            for (ls,lm,ld) in lead:
                if ls//16==b%4:
                    add(tone(lm,ld*step,0.16,6)*np.exp(-np.arange(int(ld*step*SR))/SR*2), t0+(ls%16)*step)
                    T["melody_lead"].append((at(t0+(ls%16)*step), at(t0+(ls%16)*step)+ld*step, lm))   # the lead line, exact: onset, offset, MIDI
        if bassline:
            for (ls,lm,ld) in bassline:
                if ls//16==b%4:
                    add(e808(lm,ld*step), t0+(ls%16)*step)
                    T["bass"].append((at(t0+(ls%16)*step), at(t0+(ls%16)*step)+ld*step, lm))
        ch=prog[b%len(prog)]
        for m in ch: add(tone(m,16*step,0.08,5),t0)
        # end = the next bar's start, computed the same way, so spans never overlap (mir_eval rejects overlaps)
        T["chords"].append((at(t0), at((b+1)*16*step), NOTE[ch[0] % 12] + (":min" if ch[1]-ch[0]==3 else ":maj")))
        # random melody notes in scale
        scale=[0,2,3,5,7,8,10] if minor else [0,2,4,5,7,9,11]
        for k in range(0 if lead else 3):
            add(tone(key_root_midi+12+scale[rng.integers(7)],step*2,0.06,3),t0+rng.integers(16)*step)
    x/=np.max(np.abs(x))*1.05
    y=(x*32767).astype(np.int16); st=np.stack([y,y],1)
    with wave.open(fname,'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    T["drums"].sort(); T["bass"].sort(); T["melody_lead"].sort(); TRUTH[fname[:-4]] = T

# ---- the test songs (answers are written right here, which is what makes them useful) ----
A=57
song(127,A,False,{0,10},{4,12},{0,2,4,6,8,10,12,14},[[57,61,64],[54,57,61],[50,54,57],[52,56,59]],'pop127_Amaj.wav',ghost={15},
     tags={"style": "pop", "swing": "none", "four_on_floor": False, "bass": "808 on kick", "intro_silence": "none"})
song(142,54,True,{0,3,10},{8},set(range(16)),[[54,57,61],[50,54,57],[57,61,64],[52,56,59]],'trap142_Fsmin.wav',
     tags={"style": "trap", "swing": "none", "four_on_floor": False, "bass": "808 on kick", "intro_silence": "none"})
song(124,48,True,{0,4,8,12},{4,12},{2,6,10,14},[[48,51,55],[44,48,51],[51,55,58],[46,50,53]],'house124_Cmin.wav',swing=0.1,
     tags={"style": "house", "swing": "light", "four_on_floor": True, "bass": "808 on kick", "intro_silence": "none"})
song(100,50,True,{0,10},{4,12},set(range(16)),[[50,53,57],[46,50,53],[53,57,60],[48,52,55]],'swing100_Dmin.wav',swing=0.25,
     tags={"style": "swing", "swing": "heavy", "four_on_floor": False, "bass": "808 on kick", "intro_silence": "none"})
lead=[(0,76,3),(3,74,3),(6,72,2),(8,69,4),(12,72,4),(16,76,3),(19,77,3),(22,76,2),(24,72,8),(32,76,3),(35,74,3),(38,72,2),(40,69,4),(44,67,4),(48,69,6),(54,72,2),(56,69,8)]
bl=[(0,33,6),(6,33,2),(10,33,6),(16,29,6),(26,29,6),(32,36,6),(42,36,6),(48,31,6),(58,31,4),(62,35,2)]
song(120,57,True,{0,6,10},{4,12},{0,2,4,6,8,10,12,14},[[57,60,64],[53,57,60],[48,52,55],[55,59,62]],'lead120_Amin.wav',lead=lead,bassline=bl,
     tags={"style": "melodic", "swing": "none", "four_on_floor": False, "bass": "bassline", "intro_silence": "none"})
bl=[]; pat=[(0,0,3),(3,0,3),(6,0,1),(7,0,3),(10,0,2),(12,3,2),(14,5,2)]; roots=[30,26,33,28]
for b,r in enumerate(roots):
    for (s_,d,l) in pat: bl.append((b*16+s_,r+d,l))
song(142,54,True,{0,3,7,10},{8},set(range(16)),[[54,57,61],[50,54,57],[57,61,64],[52,56,59]],'fast808_142.wav',bassline=bl,
     tags={"style": "trap", "swing": "none", "four_on_floor": False, "bass": "bassline", "intro_silence": "none"})
import json; json.dump(bl,open('fast808_truth.json','w'))
# the same pop song with silence added, to test lining up bar 1
for name,pre in [('pad300',0.3),('pad1200',1.2)]:
    w=wave.open('pop127_Amaj.wav'); n=w.getnframes(); x=np.frombuffer(w.readframes(n),dtype=np.int16).reshape(-1,2); w.close()
    y=np.vstack([np.zeros((int(pre*SR),2),np.int16),x]); o=wave.open(f'pop127_{name}.wav','wb'); o.setnchannels(2); o.setsampwidth(2); o.setframerate(SR); o.writeframes(y.tobytes()); o.close()
    sh = int(pre*SR)/SR; P = TRUTH["pop127_Amaj"]  # every answer moves by exactly the padding
    TRUTH[f"pop127_{name}"] = {**P, "beats": [(t+sh, q) for t, q in P["beats"]], "chords": [(a+sh, b+sh, l) for a, b, l in P["chords"]],
        "drums": [(t+sh, c) for t, c in P["drums"]], "bass": [(a+sh, b+sh, m) for a, b, m in P["bass"]],
        "tags": {**P["tags"], "intro_silence": f"{int(pre*1000)} ms"}}

# ---- answers as annotation files (mir_eval / Sonic Visualiser style text) + manifest for bench/ ----
os.makedirs("truth", exist_ok=True)
f6 = lambda v: f"{v:.6f}"
tracks = []
for tid, T in TRUTH.items():
    base = f"truth/{tid}"
    W = lambda p: open(p, "w", newline="\n")  # same bytes on every OS
    with W(f"{base}.beats.txt") as f: f.writelines(f"{f6(t)}\t{q}\n" for t, q in T["beats"])
    with W(f"{base}.key.txt") as f: f.write(T["key"] + "\n")
    with W(f"{base}.chords.lab") as f: f.writelines(f"{f6(a)}\t{f6(b)}\t{l}\n" for a, b, l in T["chords"])
    with W(f"{base}.drums.txt") as f: f.writelines(f"{f6(t)}\t{c}\n" for t, c in T["drums"])
    with W(f"{base}.bass.txt") as f: f.writelines(f"{f6(a)}\t{f6(b)}\t{m}\n" for a, b, m in T["bass"])
    if T.get("melody_lead"):
        with W(f"{base}.melody_lead.txt") as f: f.writelines(f"{f6(a)}\t{f6(b)}\t{m}\n" for a, b, m in T["melody_lead"])
    sha_of = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
    ann = {k: f"{base}.{ext}" for k, ext in [("beats", "beats.txt"), ("key", "key.txt"), ("chords", "chords.lab"), ("drums", "drums.txt"), ("bass", "bass.txt")]}
    if T.get("melody_lead"): ann["melody_lead"] = f"{base}.melody_lead.txt"
    tracks.append({"id": tid, "audio": f"{tid}.wav", "sha256": sha_of(f"{tid}.wav"), "split": "synthetic",
        # leakage identifiers: one generator "artist" and release; the padded copies are the same song family
        "artists": ["Track Teardown test generator"], "release": "synthetic test songs v1",
        "songFamily": "pop127" if tid.startswith("pop127") else tid,
        "rights": {"source": "generated by test-songs/make_test_songs.py", "licence": "project-owned synthetic audio"},
        "tempo": T["bpm"], "tags": {**T["tags"], "tempo_band": "<90" if T["bpm"] < 90 else "90-115" if T["bpm"] < 115 else "115-135" if T["bpm"] < 135 else "135-160" if T["bpm"] < 160 else ">160"},
        "annotations": ann, "annotationSha256": {k: sha_of(p) for k, p in ann.items()}})
with open("manifest.json", "w", newline="\n") as f:
    json.dump({"name": "synthetic", "version": 3, "annotationProtocol": "synthetic-exact",
               "note": "Generated answers, exact by construction. Regression checks only, not real-world accuracy.",
               "requirements": {"checksums": True, "continuousBeats": True, "identity": True,
                                "annotations": {k: "all" for k in ["beats", "downbeats", "key", "chords", "drums", "bass"]}},
               "tracks": tracks}, f, indent=1)
print('ok')
