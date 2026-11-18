// The teardown on screen, its audio and the analysis job. Port of the legacy page's handle()/supersedeAnalysis()/cancel (index.html):
// only the newest upload may change shared state; a cancelled, failed or superseded upload changes nothing; the teardown on screen
// owns exactly one audio object URL.
//
// The result is held as $state.raw and never mutated in place: user corrections build a new object (replace()), carrying the
// non-enumerable grid/__buf across (docs/SVELTE_MIGRATION.md §0). There is no example teardown: until a track is analysed, nothing
// is shown, so the page never presents numbers that were not measured from the user's audio.
import { engine, bufferOf, withHidden, type AnalysisResult } from "../engine";
import { domain } from "../domain";
import { loadHist, saveHist } from "../storage/data";

declare const __TEST_HOOKS__: boolean;
const { fixSectionTimes } = domain;
const copy = (a: AnalysisResult) => withHidden(a, JSON.parse(JSON.stringify(a)) as AnalysisResult);

class Teardown {
  result = $state.raw<AnalysisResult | null>(null);
  /** Bumped whenever the result object is replaced, for views that cache derived values. */
  rev = $state(0);
  /** A new teardown on screen (a fresh analysis or a saved one opened): views start fresh. */
  mountId = $state(0);
  /** Index of the selected section on the timeline. */
  selected = $state(0);
  audioURL = $state<string | null>(null);
  /** The decoded audio of the teardown on screen (never reactive, never persisted, never a production global). */
  buffer: AudioBuffer | null = null;
  status = $state({ text: "Choose an audio file to take apart. It is analysed in this browser and never uploaded.", err: false });
  progress = $state(0);
  running = $state(false);
  history = $state.raw<AnalysisResult[]>([]);
  histNote = $state({ text: "", bad: false });
  title = $state("");
  private job = 0;
  private ctl: AbortController | null = null;

  private show(a: AnalysisResult) {
    try { fixSectionTimes(a); } catch { /* never blocks showing a teardown */ }
    this.result = a; this.rev++;
    if (__TEST_HOOKS__) (window as unknown as { __td: AnalysisResult }).__td = a; // bench build only: tests observe each teardown shown
  }
  refreshHistory() { this.history = loadHist(); }
  private save(a: AnalysisResult) { const r = saveHist(a); this.histNote = { text: r.note, bad: r.bad }; this.refreshHistory(); }

  supersede(msg?: string) {
    this.job++;
    if (this.ctl) { this.ctl.abort(); this.ctl = null; }
    if (this.running && msg) { this.status = { text: msg, err: false }; this.progress = 0; }
    this.running = false;
  }
  cancel() { if (this.running) this.supersede("Analysis cancelled. Nothing was changed."); }

  async analyzeFile(file: File | undefined | null) {
    if (!file) return;
    if (this.ctl) this.ctl.abort();
    const job = ++this.job, ctl = this.ctl = new AbortController(); this.running = true;
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
      this.selected = 0; this.show(a); this.mountId++; this.save(a); this.ctl = null; this.running = false;
      if (oldURL) URL.revokeObjectURL(oldURL);
    } catch (e) {
      const err = e as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!current() || (err && err.name === "AbortError")) return;
      this.ctl = null; this.running = false;
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
    this.audioURL = null; this.buffer = null; this.selected = 0;
    this.show(saved); this.mountId++;
  }
  /** Apply a user correction by replacement (never in place), then save. `edit` returns false to refuse the change. */
  replace(edit: (next: AnalysisResult) => boolean | void) {
    if (!this.result) return false;
    const next = copy(this.result);
    if (edit(next) === false) return false;
    this.show(next); this.save(next);
    return true;
  }
}
export const teardown = new Teardown();
