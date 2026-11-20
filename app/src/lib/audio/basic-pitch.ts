// Note transcription with Spotify's Basic Pitch (Apache-2.0), run entirely in this browser tab: the audio is never uploaded. The model
// (about 0.9 MB, public/models/basic-pitch) and the tf.js runtime are fetched only when a track is transcribed, so the first paint is
// unchanged. Basic Pitch is a polyphonic model: it writes every note it hears, with pitch, start, length and strength, not one melody.
// Settings are the library's own defaults (the same as the Python package's), fixed here and NOT tuned on any track.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TranscribedNote { on: number; off: number; midi: number; vel: number }
export const BASIC_PITCH = Object.freeze({
  name: "Spotify Basic Pitch 1.0.1 (ICASSP 2022 model, tf.js)", sampleRate: 22050,
  onsetThreshold: 0.5, frameThreshold: 0.3, minNoteFrames: 11 /* 11 frames of 11.6 ms = 128 ms, the library default */, energyTolerance: 11,
});

/** Mono, 22.05 kHz, as the model requires (the browser resamples and mixes down). */
export async function toModelAudio(buffer: AudioBuffer): Promise<Float32Array> {
  const sr = BASIC_PITCH.sampleRate, len = Math.max(1, Math.ceil(buffer.duration * sr)), Ctx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!Ctx) throw new Error("this browser cannot resample audio");
  const ctx = new Ctx(1, len, sr), src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination); src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}

/** What the last run used (shown nowhere; tests and measurements read it through window.__bpInfo in the bench build). */
export const info: { backend: string | null; ms: number | null } = { backend: null, ms: null };
let cached: Promise<any> | null = null;
function load() {
  if (!cached) cached = (async () => {
    const [bp, tf] = await Promise.all([import("@spotify/basic-pitch"), import("@tensorflow/tfjs")]);
    const forced = (window as any).__ttBpBackend as string | undefined; // research and tests only: force "cpu" or "webgl"
    if (forced) await tf.setBackend(forced);
    await tf.ready(); info.backend = tf.getBackend();
    const url = new URL("models/basic-pitch/model.json", document.baseURI).href;
    return { bp, tf, model: new bp.BasicPitch(url) };
  })().catch(e => { cached = null; throw e; });
  return cached;
}

/** Transcribe a decoded track. `onProgress` gets 0..1; `isStale` is polled so a superseded run stops early. Throws on failure (the caller falls back). */
export async function transcribe(buffer: AudioBuffer, onProgress: (p: number) => void, isStale: () => boolean = () => false): Promise<TranscribedNote[]> {
  onProgress(0); const t0 = performance.now();
  const { bp, model } = await load(); if (isStale()) return [];
  const audio = await toModelAudio(buffer); if (isStale()) return [];
  const frames: number[][] = [], onsets: number[][] = [];
  await model.evaluateModel(audio, (f: number[][], o: number[][]) => { frames.push(...f); onsets.push(...o); }, (p: number) => { if (isStale()) throw new Error("stale"); onProgress(0.05 + 0.85 * p); });
  const ev = bp.noteFramesToTime(bp.outputToNotesPoly(frames, onsets, BASIC_PITCH.onsetThreshold, BASIC_PITCH.frameThreshold, BASIC_PITCH.minNoteFrames, true, null, null, true, BASIC_PITCH.energyTolerance));
  onProgress(1); info.ms = Math.round(performance.now() - t0);
  return ev.map((n: any) => ({ on: n.startTimeSeconds, off: n.startTimeSeconds + n.durationSeconds, midi: n.pitchMidi, vel: Math.max(1, Math.min(127, Math.round(n.amplitude * 127))) })).sort((a: TranscribedNote, b: TranscribedNote) => a.on - b.on || a.midi - b.midi);
}
