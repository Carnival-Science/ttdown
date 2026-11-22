// Runs an analysis without blocking the page: the file is checked and decoded here (engine.decode), then the engine's analysis runs in
// a Web Worker (analysis.worker.ts) on a copy of the samples. Same engine, same input, so the same result; what changes is that the
// page keeps drawing (measured: a 70 s track used to stop every frame for about 6 s at a time, a 7 min one for about 16 s).
// A cancel ends the worker at once (on the page, the engine could only stop at its next checkpoint). The engine's counters
// (ANALYSIS_STATS, read by tests) are kept up to date from the worker's. If a worker cannot be started (a browser without module
// workers, or the page opened from a file), the analysis runs on the page as before, which is slower to draw but gives the same result.
import { engine } from "./index";
import type { AnalysisResult } from "./types";
import type { Forced } from "./engine-module";

type Progress = (pct: number, msg: string) => void;
let base = { checkpoints: 0, aborted: 0 };

function workerFor(): Worker | null {
  try { return new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" }); } catch { return null; }
}

/** analyzeDecoded() in a worker. Resolves with the result, with the decoded buffer and the tracked grid attached as the engine does. */
export function analyzeDecodedOffThread(ab: AudioBuffer, onProg: Progress, signal?: AbortSignal, forced?: Forced): Promise<AnalysisResult> {
  const S = engine.ANALYSIS_STATS;
  const onPage = () => engine.analyzeDecoded(ab, onProg, false, signal, forced);
  if (signal?.aborted) { S.aborted++; return Promise.reject(new DOMException("Analysis cancelled", "AbortError")); }
  const w = workerFor(); if (!w) return onPage();
  base = { checkpoints: S.checkpoints, aborted: S.aborted };
  const mirror = (s?: { checkpoints: number; aborted: number }) => { if (s) { S.checkpoints = base.checkpoints + s.checkpoints; S.aborted = base.aborted + s.aborted; } };
  return new Promise<AnalysisResult>((resolve, reject) => {
    let started = false;
    const end = () => { w.terminate(); signal?.removeEventListener("abort", abort); };
    const abort = () => { end(); S.aborted++; reject(new DOMException("Analysis cancelled", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data; started = true; mirror(m.stats);
      if (m.type === "progress") { onProg(m.pct, m.msg); return; }
      end();
      if (m.type === "done") {
        const r = m.result as AnalysisResult;
        if (m.grid) Object.defineProperty(r, "grid", { value: m.grid, enumerable: false, configurable: true });
        Object.defineProperty(r, "__buf", { value: ab, enumerable: false, configurable: true });
        resolve(r);
      } else reject(m.limit ? new engine.InputLimitError(m.message) : Object.assign(new Error(m.message), { name: m.name }));
    };
    // the worker's script could not load or run (not an analysis error: those arrive as messages): analyse on the page instead
    w.onerror = (e: ErrorEvent) => { e.preventDefault(); end(); if (signal?.aborted) return; if (!started) onPage().then(resolve, reject); else reject(new Error(e.message || "the analysis worker failed")); };
    const L = ab.getChannelData(0).slice(), R = ab.numberOfChannels > 1 ? ab.getChannelData(1).slice() : null;
    w.postMessage({ L, R, sampleRate: ab.sampleRate, duration: ab.duration, forced: forced ? { ...forced } : undefined }, R ? [L.buffer, R.buffer] : [L.buffer]);
  });
}

/** analyze(): decode on the page, analyse in a worker. */
export async function analyzeOffThread(file: File, onProg: Progress, signal?: AbortSignal): Promise<AnalysisResult> {
  const ab = await engine.decode(file, onProg, signal);
  return analyzeDecodedOffThread(ab, onProg, signal);
}
