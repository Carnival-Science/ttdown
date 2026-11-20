// Runs Spotify's Basic Pitch off the main thread (see basic-pitch.ts). Messages in: { audio (22.05 kHz mono, transferred), url (model.json),
// forced ("cpu" | "webgl" | undefined), settings }. Messages out: { type: "progress", p } ..., then { type: "done", notes, backend } or { type: "error", message }.
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as bp from "@spotify/basic-pitch";
import * as tf from "@tensorflow/tfjs";

self.onmessage = async (e: MessageEvent) => {
  const { audio, url, forced, settings } = e.data as { audio: Float32Array; url: string; forced?: string; settings: { onsetThreshold: number; frameThreshold: number; minNoteFrames: number; energyTolerance: number } };
  const post = (m: unknown) => (self as any).postMessage(m);
  try {
    // CPU by default: in headless Chromium the worker's WebGL backend (OffscreenCanvas, software GL) stalled at 5% for over 8 minutes, so it is opt-in (forced = "webgl") until it is measured on real GPUs
    await tf.setBackend(forced || "cpu");
    await tf.ready();
    const model = new bp.BasicPitch(url), frames: number[][] = [], onsets: number[][] = [];
    await model.evaluateModel(audio, (f: number[][], o: number[][]) => { frames.push(...f); onsets.push(...o); }, (p: number) => post({ type: "progress", p: 0.05 + 0.85 * p }));
    const ev = bp.noteFramesToTime(bp.outputToNotesPoly(frames, onsets, settings.onsetThreshold, settings.frameThreshold, settings.minNoteFrames, true, null, null, true, settings.energyTolerance));
    const notes = ev.map((n: any) => ({ on: n.startTimeSeconds, off: n.startTimeSeconds + n.durationSeconds, midi: n.pitchMidi, vel: Math.max(1, Math.min(127, Math.round(n.amplitude * 127))) })).sort((a: any, b: any) => a.on - b.on || a.midi - b.midi);
    post({ type: "done", notes, backend: tf.getBackend() });
  } catch (err) { post({ type: "error", message: String((err as Error)?.message || err) }); }
};
