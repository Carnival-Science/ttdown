// The teardown on screen, its audio and the analysis job. Port of the legacy page's handle()/supersedeAnalysis()/cancel
// (index.html): only the newest upload may change shared state; a cancelled, failed or superseded upload changes nothing; the
// teardown on screen owns exactly one audio object URL.
//
// Results are held as $state.raw and never mutated in place: corrections build a new object (replace()), carrying the
// non-enumerable grid/__buf across (founder decision, docs/SVELTE_MIGRATION.md §0).
import { engine, bufferOf, withHidden, type AnalysisResult } from "../engine";
import { domain } from "../domain";
import { loadHist, saveHist } from "../storage/data";

const { EXAMPLE, fixSectionTimes } = domain;
declare const __TEST_HOOKS__: boolean;
const copy = (a: AnalysisResult) => withHidden(a, JSON.parse(JSON.stringify(a)) as AnalysisResult);

class Teardown {
  result = $state.raw<AnalysisResult>(EXAMPLE);
  example = $state(true);
  /** Bumped whenever the result object is replaced, for views that cache derived values. */
  rev = $state(0);
  /** A new teardown on screen (fresh analysis, a saved one opened, the example): views start fresh, as the legacy render() did. */
  mountId = $state(0);
  audioURL = $state<string | null>(null);
  /** The decoded audio of the teardown on screen (never reactive, never persisted, never a production global). */
  buffer: AudioBuffer | null = null;
  status = $state({ text: "No song yet. Below is an example teardown so you can see what you'll get.", err: false });
  progress = $state(0);
  running = $state(false);
  tab = $state("overview");
  history = $state.raw<AnalysisResult[]>([]);
  histNote = $state({ text: "", bad: false });
  title = $state("");
  private job = 0;
  private ctl: AbortController | null = null;

  constructor() { this.show(copy(EXAMPLE), true); }

  private show(a: AnalysisResult, example: boolean) {
    try { fixSectionTimes(a); } catch { /* same as legacy render(): never blocks showing a teardown */ }
    // The legacy page's panels add these (empty) fields while rendering a real teardown, before it is saved, in this order:
    // accuracyPanel (checks, then stems), chordChecker (chordChecks, only with chord bars). Results and saved records must be
    // identical between the two apps, so the same fields are added here.
    if (!example) { a.checks = a.checks || {}; a.stems = a.stems || {}; if (a.chords && (a.chords as { bars?: unknown }).bars) a.chordChecks = a.chordChecks || {}; }
    this.result = a; this.example = example; this.rev++;
    // bench build only: like the legacy render(), assign window.__td once per teardown shown (tests observe these assignments)
    if (__TEST_HOOKS__) (window as unknown as { __td: AnalysisResult }).__td = a;
  }
  refreshHistory() { this.history = loadHist(); }
  private save(a: AnalysisResult) { const r = saveHist(a); this.histNote = { text: r.note, bad: r.bad }; this.refreshHistory(); }

  private setRunning(v: boolean) { this.running = v; }
  supersede(msg?: string) {
    this.job++;
    if (this.ctl) { this.ctl.abort(); this.ctl = null; }
    if (this.running && msg) { this.status = { text: msg, err: false }; this.progress = 0; }
    this.setRunning(false);
  }
  cancel() { if (this.running) this.supersede("Analysis cancelled. Nothing was changed."); }

  async analyzeFile(file: File | undefined | null) {
    if (!file) return;
    if (this.ctl) this.ctl.abort();
    const job = ++this.job, ctl = this.ctl = new AbortController(); this.setRunning(true);
    const current = () => job === this.job;
    const newURL = URL.createObjectURL(file); let adopted = false;
    this.status = { text: this.status.text, err: false };
    try {
      const a = await engine.analyze(file, (p, msg) => { if (!current()) return; this.progress = p; this.status = { text: msg, err: false }; }, false, ctl.signal);
      if (!current()) return;
      a.title = this.title.trim() || file.name.replace(/\.[^.]+$/, "");
      this.buffer = bufferOf(a) || null;
      this.status = { text: `Teardown ready for “${a.title}”. Scroll down.`, err: false };
      const oldURL = this.audioURL; this.audioURL = newURL; adopted = true;
      this.tab = "overview"; this.show(a, false); this.mountId++; this.save(a); this.ctl = null; this.setRunning(false);
      if (oldURL) URL.revokeObjectURL(oldURL);
    } catch (e) {
      const err = e as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!current() || (err && err.name === "AbortError")) return;
      this.ctl = null; this.setRunning(false);
      this.status = { text: err instanceof engine.InputLimitError ? err.message : "Couldn't read that file. Try an MP3 or WAV. (" + (err && err.message ? err.message.slice(0, 80) : "decode error") + ")", err: true };
      this.progress = 0;
    } finally {
      if (!adopted) URL.revokeObjectURL(newURL);
    }
  }
  /** Open a saved teardown: stops any analysis in progress; saved teardowns have no audio. */
  open(saved: AnalysisResult) {
    this.supersede("Opened a saved teardown, so the analysis in progress was stopped.");
    if (this.audioURL) URL.revokeObjectURL(this.audioURL);
    this.audioURL = null; this.buffer = null;
    this.show(saved, false); this.mountId++;
  }
  /** Apply a user edit by replacement (never in place), then save, as the legacy page re-rendered and saved. */
  replace(edit: (next: AnalysisResult) => boolean | void, opts: { save?: boolean } = {}) {
    const next = copy(this.result);
    if (edit(next) === false) return false;
    this.show(next, this.example);
    if (!this.example && opts.save !== false) this.save(next);
    return true;
  }
}
export const teardown = new Teardown();
