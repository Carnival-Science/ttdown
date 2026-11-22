// The analysis, off the page's main thread. The engine's analysis stages are long synchronous loops (several seconds each on a full
// track); run on the page they stop every frame, so the motif, the progress bar and the cycling copy freeze. Here they run in a Web
// Worker on the same canonical engine (src/engine.js): the page decodes the file (the browser's decoder needs a page) and posts the
// samples; this runs analyzeDecoded() on them, unchanged, and posts back progress, the engine's counters and the result.
/* eslint-disable @typescript-eslint/no-explicit-any */
import createEngine from "$engine";
import { TimeMap } from "../timemap";
import type { Forced } from "./engine-module";

const engine = createEngine({ TimeMap });
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
const stats = () => ({ ...engine.ANALYSIS_STATS });

self.onmessage = async (e: MessageEvent<{ L: Float32Array; R: Float32Array | null; sampleRate: number; duration: number; forced?: Forced }>) => {
  const { L, R, sampleRate, duration, forced } = e.data;
  // what analyzeDecoded() reads from an AudioBuffer: its channels, their count and the duration
  const buf = { numberOfChannels: R ? 2 : 1, length: L.length, sampleRate, duration, getChannelData: (i: number) => (i > 0 && R ? R : L) } as unknown as AudioBuffer;
  try {
    // compare = true: the engine does not attach this stand-in buffer to the result (the page attaches the real one)
    const result = await engine.analyzeDecoded(buf, (pct, msg) => post({ type: "progress", pct, msg, stats: stats() }), true, undefined, forced);
    post({ type: "done", result, grid: Object.getOwnPropertyDescriptor(result, "grid")?.value ?? null, stats: stats() });
  } catch (err: any) {
    post({ type: "error", limit: err instanceof engine.InputLimitError, name: err?.name || "Error", message: err?.message || String(err), stats: stats() });
  }
};
