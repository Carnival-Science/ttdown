// Types for the canonical ../../../../src/timemap.js (imported as "$timemap"). Only what the app uses is typed;
// the module itself is documented in docs/TIMEMAP.md. Hand-written: keep in step with src/timemap.js.
export type BeatSource = "measured" | "user" | "fallback-grid";
export type MeterStatus = "measured" | "assumed" | "user" | "ambiguous" | "unsupported";
export interface Meter { beatsPerBar: number; numerator: number | null; denominator: number | null; beatUnit: string | null; status: MeterStatus; note?: string | null }
export interface Position { t: number; beat: number; bar: number | null; beatInBar: number | null; extrapolated: boolean; source: BeatSource }
export interface ExportEligibility { state: "allowed" | "needs-confirmation" | "refused"; eligible: boolean; needs: string[]; reasons: string[]; caveats: string[] }
export interface TimeMapInstance {
  readonly source: "tracker" | "fallback-grid";
  readonly meter: Meter;
  readonly hasBars: boolean;
  timeToBeat(t: number): number;
  beatToTime(q: number): number;
  position(t: number): Position;
  barStart(bar: number): number;
  bars(): number[];
  exportEligibility(): ExportEligibility;
  fingerprint(): string;
  toJSON(): unknown;
}
export interface ConstantGridInput { bpm: number; firstDownbeat: number; duration: number; beatsPerBar?: number; settings?: Record<string, unknown> }
export interface TrackedGridInput { beats: number[]; downbeats: number[] }
export interface TimeMapModule {
  readonly SCHEMA: string;
  readonly DEFAULTS: Readonly<Record<string, number>>;
  TimeMapError: new (...args: unknown[]) => Error & { code: string };
  fromGrid(grid: TrackedGridInput, opts: { duration: number; meter?: Partial<Meter>; settings?: Record<string, unknown> }): TimeMapInstance;
  fromConstantGrid(input: ConstantGridInput): TimeMapInstance;
  fromJSON(json: unknown): TimeMapInstance;
  forAnalysis(result: unknown, opts?: Record<string, unknown>): unknown;
}
declare const TimeMap: TimeMapModule;
export default TimeMap;
