// The app's only entry to TimeMap. Re-exports the canonical src/timemap.js (see vite.config.ts); no second copy.
import TimeMap from "$timemap";
export type * from "./timemap-module";
export { TimeMap };

/* A fixed map computed at start-up. Its fingerprint must equal the one Node computes from the same source
   (tests/smoke.mjs), which proves the dev server and the production build run the canonical module unchanged. */
export const SELF_CHECK_INPUT = { bpm: 120, firstDownbeat: 0.5, duration: 30, beatsPerBar: 4 } as const;
export function timeMapSelfCheck(): { schema: string; fingerprint: string; bar2: number } {
  const m = TimeMap.fromConstantGrid({ ...SELF_CHECK_INPUT });
  return { schema: TimeMap.SCHEMA, fingerprint: m.fingerprint(), bar2: m.barStart(2) };
}
