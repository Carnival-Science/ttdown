// Loudness per bar, measured from the decoded audio: RMS of the mono mix between two bar lines, in dB. Bar lines come from the
// teardown's grid, so the columns line up with the ruler and the sections. Cached per buffer and grid signature.
import type { Grid } from "./grid";

export interface BarLoudness { bar: number; start: number; end: number; db: number; level: number }
const CACHE = new WeakMap<AudioBuffer, { sig: string; out: BarLoudness[] }>();

export function barLoudness(buf: AudioBuffer, G: Grid, duration: number, sig: string): BarLoudness[] {
  const hit = CACHE.get(buf); if (hit && hit.sig === sig) return hit.out;
  const sr = buf.sampleRate, chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), n = buf.length;
  const stride = Math.max(1, Math.round(sr / 11025)), raw: BarLoudness[] = [];
  let b = Math.max(0, G.barOf(0)); if (G.barStart(b) > 0.01 && b > 0) b--;
  for (let guard = 0; guard < 5000; guard++, b++) {
    const t0 = Math.max(0, G.barStart(b)), t1 = Math.min(duration, G.barStart(b + 1));
    if (t0 >= duration) break; if (t1 - t0 < 0.05) continue;
    const i0 = Math.floor(t0 * sr), i1 = Math.min(n, Math.floor(t1 * sr)); let s = 0, k = 0;
    for (let i = i0; i < i1; i += stride) { let v = 0; for (const ch of chans) v += ch[i] ?? 0; v /= chans.length; s += v * v; k++; }
    raw.push({ bar: b, start: t0, end: t1, db: 10 * Math.log10(s / (k || 1) + 1e-12), level: 0 });
  }
  // the scale runs from 30 dB below the loudest bar to the loudest bar, so quiet intros still show
  const top = Math.max(...raw.map(r => r.db)), floor = top - 30;
  for (const r of raw) r.level = Math.max(0.04, Math.min(1, (r.db - floor) / (top - floor)));
  CACHE.set(buf, { sig, out: raw }); return raw;
}
