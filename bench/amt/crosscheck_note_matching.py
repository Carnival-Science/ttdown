"""Independent check of bench/amt/note-matching.js against mir_eval.transcription.match_notes.

    python bench/amt/crosscheck_note_matching.py cases.json      (tests/amt-note-matching.test.js writes the cases and runs this)

cases.json = {"cases": [{"name", "ref": [[on, off, midi], ...], "est": [...], "onset": N, "offset": N}]}, where onset / offset are the JS
match counts (onset only; onset and offset). mir_eval recomputes both from the same notes, with its defaults (onset 50 ms, pitch 50 cents,
offset ratio 0.2, offset minimum 50 ms) and its own maximum bipartite matching. Every count must be EQUAL. Times must be >= 0 (mir_eval
rejects negative times; the cases are built that way, so nothing is shifted and no rounding is introduced here). Exits 1 on any mismatch.
"""
import json, sys, warnings
import numpy as np
import mir_eval

warnings.filterwarnings("ignore")  # mir_eval warns about empty inputs; those cases are compared anyway
cases = json.load(open(sys.argv[1], encoding="utf-8"))["cases"]
hz = lambda m: 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)
iv = lambda L: np.array([[n[0], n[1]] for n in L], dtype=float).reshape(-1, 2)
fails = 0
for c in cases:
    ri, rp, ei, ep = iv(c["ref"]), hz([n[2] for n in c["ref"]]), iv(c["est"]), hz([n[2] for n in c["est"]])
    onset = len(mir_eval.transcription.match_notes(ri, rp, ei, ep, onset_tolerance=0.05, pitch_tolerance=50.0, offset_ratio=None))
    offset = len(mir_eval.transcription.match_notes(ri, rp, ei, ep, onset_tolerance=0.05, pitch_tolerance=50.0, offset_ratio=0.2, offset_min_tolerance=0.05))
    if onset != c["onset"] or offset != c["offset"]:
        fails += 1; print(f"MISMATCH {c['name']}: JS onset {c['onset']} offset {c['offset']}, mir_eval onset {onset} offset {offset}")
print(f"amt note matching vs mir_eval {mir_eval.__version__}: {len(cases)} cases, {fails} mismatches")
sys.exit(1 if fails else 0)
