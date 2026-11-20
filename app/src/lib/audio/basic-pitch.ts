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

/** Transcribe a decoded track in a Web Worker, so the page stays usable while the model runs (on the CPU backend one batch can block a
 *  thread for many seconds). `onProgress` gets 0..1; `isStale` is polled so a superseded run is cancelled: the worker is terminated. Throws on failure (the caller falls back). */
export async function transcribe(buffer: AudioBuffer, onProgress: (p: number) => void, isStale: () => boolean = () => false): Promise<TranscribedNote[]> {
  onProgress(0); const t0 = performance.now();
  const audio = await toModelAudio(buffer); if (isStale()) return [];
  const url = new URL("models/basic-pitch/model.json", document.baseURI).href, forced = (window as any).__ttBpBackend as string | undefined; // forced: research and tests only ("cpu" or "webgl")
  const worker = new Worker(new URL("./basic-pitch.worker.ts", import.meta.url), { type: "module" });
  return new Promise<TranscribedNote[]>((resolve, reject) => {
    const done = (f: () => void) => { clearInterval(poll); worker.terminate(); f(); };
    const poll = setInterval(() => { if (isStale()) done(() => reject(new Error("stale"))); }, 200);
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m.p);
      else if (m.type === "done") done(() => { info.backend = m.backend; info.ms = Math.round(performance.now() - t0); onProgress(1); resolve(m.notes); });
      else if (m.type === "error") done(() => reject(new Error(m.message)));
    };
    worker.onerror = e => done(() => reject(new Error(e.message || "the note model's worker failed")));
    worker.postMessage({ audio, url, forced, settings: BASIC_PITCH }, [audio.buffer]);
  });
}
