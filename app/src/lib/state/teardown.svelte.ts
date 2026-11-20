// The teardown on screen, its audio and the analysis job. Port of the legacy page's handle()/supersedeAnalysis()/cancel (index.html):
// only the newest upload may change shared state; a cancelled, failed or superseded upload changes nothing; the teardown on screen
// owns exactly one audio object URL.
//
// The result is held as $state.raw and never mutated in place: user corrections build a new object (replace()), carrying the
// non-enumerable grid/__buf across (docs/SVELTE_MIGRATION.md §0). There is no example teardown: until a track is analysed, nothing
// is shown, so the page never presents numbers that were not measured from the user's audio.
import { engine, bufferOf, withHidden, type AnalysisResult } from "../engine";
import { domain } from "../domain";
import { loadHist, saveHist, deleteHist, clearHist } from "../storage/data";
import { notify, pending } from "../ui/toast";
import { gridOf } from "../timeline/grid";
import { transcribe, BASIC_PITCH, type TranscribedNote } from "../audio/basic-pitch";

declare const __TEST_HOOKS__: boolean;
const { fixSectionTimes, applyTempo, applyMeter, forcedOf, recordCorrection } = domain;
/** Basic Pitch runs in the production app. The bench build (tests) skips it unless a test opts in, so the other browser tests keep their speed and determinism. */
const notesModelOn = () => !__TEST_HOOKS__ || (window as unknown as { __ttBasicPitch?: boolean }).__ttBasicPitch === true;
const NOTES_METHOD = `${BASIC_PITCH.name}; onset ${BASIC_PITCH.onsetThreshold}, frame ${BASIC_PITCH.frameThreshold}, minimum ${BASIC_PITCH.minNoteFrames} frames (library defaults)`;
const copy = (a: AnalysisResult) => withHidden(a, JSON.parse(JSON.stringify(a)) as AnalysisResult);

class Teardown {
  result = $state.raw<AnalysisResult | null>(null);
  /** Bumped whenever the result object is replaced, for views that cache derived values. */
  rev = $state(0);
  /** A new teardown on screen (a fresh analysis or a saved one opened): views start fresh. */
  mountId = $state(0);
  /** Bumped only when an analysis finishes (not when a saved teardown is opened): the view plays its reveal sweep. */
  analysedId = $state(0);
  /** Index of the selected section on the timeline. */
  selected = $state(0);
  audioURL = $state<string | null>(null);
  /** The decoded audio of the teardown on screen (a reference, never copied or persisted, never a production global). Reactive, so what is drawn from it appears when audio is attached. */
  buffer = $state.raw<AudioBuffer | null>(null);
  status = $state({ text: "Choose an audio file to take apart.", err: false });
  progress = $state(0);
  running = $state(false);
  /** The note model (Basic Pitch) is running on the track on screen: the teardown is already usable, its notes are replaced when this finishes. */
  transcribing = $state(false);
  /** The model's notes for the audio on screen, in seconds (they do not depend on the grid, so a tempo or bar-1 correction relabels the same notes). */
  private bpNotes: TranscribedNote[] | null = null;
  history = $state.raw<AnalysisResult[]>([]);
  /** The name in the toolbar: the optional name for the next analysis, and the name of the teardown on screen. */
  title = $state("");
  /** The person typed a name for the next analysis (used once; otherwise the file name is). */
  titleTyped = false;
  private job = 0;
  private ctl: AbortController | null = null;

  private show(a: AnalysisResult) {
    try { fixSectionTimes(a); } catch { /* never blocks showing a teardown */ }
    this.result = a; this.rev++;
    if (__TEST_HOOKS__) (window as unknown as { __td: AnalysisResult }).__td = a; // bench build only: tests observe each teardown shown
    if (__TEST_HOOKS__) (window as unknown as { __tdReplace: unknown }).__tdReplace = (fn: (r: AnalysisResult) => void) => this.replace(fn); // bench build only: tests build a variant (say, a track without drums) of what is shown
  }
  refreshHistory() { this.history = loadHist(); }
  /** Delete a saved teardown from this browser's storage (the one on screen, if it is that one, stays open but is no longer saved). */
  forget(h: AnalysisResult) {
    const ok = deleteHist(h), shown = this.result && this.result.title === h.title && this.result.duration === h.duration;
    this.refreshHistory();
    if (ok) notify("success", shown ? `“${h.title || "Untitled"}” is deleted from this browser. It is still open here, but it is no longer saved.` : `Deleted “${h.title || "Untitled"}” from this browser.`);
    else notify("error", "Couldn't delete it: this browser blocked access to its storage.");
  }
  forgetAll() {
    const ok = clearHist(), shown = !!this.result; this.refreshHistory();
    if (ok) notify("success", shown ? "All saved teardowns are deleted from this browser. The one open here stays open, but it is no longer saved." : "All saved teardowns are deleted from this browser.");
    else notify("error", "Couldn't delete them: this browser blocked access to its storage.");
  }
  private save(a: AnalysisResult) { const r = saveHist(a); if (r.note) notify(r.bad ? "error" : "info", r.note); this.refreshHistory(); }

  supersede(msg?: string) {
    this.job++;
    if (this.ctl) { this.ctl.abort(); this.ctl = null; }
    if (this.running && msg) { this.status = { text: msg, err: false }; this.progress = 0; }
    this.running = false;
  }
  cancel() { if (this.running) this.supersede("Analysis cancelled. Nothing was changed."); }

  /** Replace the engine's rough notes by the note model's, at the current grid. */
  private useNotes() {
    if (!this.bpNotes) return;
    const notes = this.bpNotes;
    this.replace(n => { (n as AnalysisResult & { transcription?: unknown }).transcription = domain.transcriptionFromNotes(n, gridOf(n), notes, NOTES_METHOD); });
  }
  /** Run the note model on the audio on screen, in the background; the quick analysis stays on screen and usable. Falls back to it, saying so, if the model fails. */
  private async transcribeNotes(job: number) {
    const buf = this.buffer; if (!buf || !notesModelOn() || job !== this.job) return;
    if (this.bpNotes) { this.useNotes(); return; }
    const current = () => job === this.job, title = this.result?.title || "", ready = `Teardown ready for “${title}”.`;
    this.transcribing = true; this.progress = 0; this.status = { text: ready + " Transcribing the notes…", err: false };
    try {
      const notes = await transcribe(buf, p => { if (!current()) return; this.progress = Math.round(p * 100); this.status = { text: `${ready} Transcribing the notes… ${Math.round(p * 100)}%`, err: false }; }, () => !current());
      if (!current()) return;
      this.bpNotes = notes; this.useNotes();
      this.status = { text: ready + " Notes transcribed with Basic Pitch.", err: false };
    } catch (e) {
      if (!current() || (e as Error)?.message === "stale") return;
      this.status = { text: ready, err: false };
      notify("warning", "Couldn't run the note model" + ((e as Error)?.message ? " (" + (e as Error).message.slice(0, 80) + ")" : "") + ". The quick, rougher notes are shown instead.");
    } finally { if (current()) { this.transcribing = false; this.progress = 0; } }
  }

  async analyzeFile(file: File | undefined | null) {
    if (!file) return;
    if (this.ctl) this.ctl.abort();
    const job = ++this.job, ctl = this.ctl = new AbortController(); this.running = true; this.transcribing = false; // a newer run supersedes (and stops) the note model; the old run's finally no longer clears the flag
    const current = () => job === this.job;
    const newURL = URL.createObjectURL(file); let adopted = false;
    this.status = { text: this.status.text, err: false };
    try {
      const a = await engine.analyze(file, (p, msg) => { if (!current()) return; this.progress = p; this.status = { text: msg, err: false }; }, false, ctl.signal);
      if (!current()) return;
      a.title = (this.titleTyped && this.title.trim()) || file.name.replace(/\.[^.]+$/, "");
      this.title = a.title; this.titleTyped = false;
      this.buffer = bufferOf(a) || null;
      this.status = { text: `Teardown ready for “${a.title}”.`, err: false };
      const oldURL = this.audioURL; this.audioURL = newURL; adopted = true;
      this.bpNotes = null; this.transcribing = false;
      this.selected = 0; this.show(a); this.mountId++; this.analysedId++; this.save(a); this.ctl = null; this.running = false;
      if (oldURL) URL.revokeObjectURL(oldURL);
      void this.transcribeNotes(job);
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
    this.audioURL = null; this.buffer = null; this.selected = 0; this.bpNotes = null; this.transcribing = false;
    this.title = saved.title || ""; this.titleTyped = false;
    this.show(saved); this.mountId++;
  }
  /* ---- corrections (Phase 2d). A tempo or first-downbeat correction re-runs the analysis from the SAME audio with that value fixed, so
     everything built on the bar grid is fresh; the result is a new analysis, not a patch. Chord and drum edits made before it are
     discarded (they were made on the old bars); a key the user set is kept (it does not depend on the grid). Without the audio (a saved
     teardown) a tempo correction instead marks the dependent results stale and an exported file is refused; a downbeat move is not offered. */
  get canRecompute() { return !!this.buffer && !!this.result; }
  async reanalyze(correction: { type: "bpm" | "downbeat"; to?: number; shift?: number }): Promise<boolean> {
    const cur = this.result, buf = this.buffer; if (!cur || !buf) return false;
    const forced = forcedOf({ timingCorrections: [...(cur.timingCorrections || []), { ...correction, source: "user", at: "" }] });
    if (this.ctl) this.ctl.abort();
    const job = ++this.job, ctl = this.ctl = new AbortController(); this.running = true; this.transcribing = false; // a newer run supersedes (and stops) the note model; the old run's finally no longer clears the flag
    const current = () => job === this.job;
    this.status = { text: forced.bpm ? `Analysing again at ${forced.bpm} BPM…` : "Analysing again with bar 1 moved…", err: false }; this.progress = 0;
    try {
      const a = await engine.analyzeDecoded(buf, (p, msg) => { if (!current()) return; this.progress = p; this.status = { text: msg, err: false }; }, false, ctl.signal, forced);
      if (!current()) return false;
      a.title = cur.title;
      // what survives: the recorded corrections that do not depend on the bar grid, and the key if the user set it
      a.timingCorrections = (cur.timingCorrections || []).filter(c => c.type === "bpm" || c.type === "key" || c.type === "downbeat" || c.type === "meter");
      if (cur.keyFixed) { a.key = cur.key; a.camelot = cur.camelot; a.relKey = cur.relKey; a.keyFixed = true; }
      if (cur.notFourFour) a.notFourFour = true;
      recordCorrection(a, correction.type === "bpm" ? { type: "bpm", from: cur.bpm, to: correction.to, recomputed: true } : { type: "downbeat", shift: correction.shift, recomputed: true });
      this.status = { text: `Analysed again at ${a.bpm} BPM. Chords and drum edits made before this were discarded.`, err: false };
      if (correction.type === "bpm") { const was = (a.timingCorrections || []).find(c => c.type === "bpm")?.from; notify("info", `Analysed again at your tempo${was ? ` (detected: ${was} BPM)` : ""}. Bars, drums, chords and notes were rebuilt from the same audio; chord and drum edits made before were discarded.`); }
      this.buffer = bufferOf(a) || buf;
      // the same audio gives the same notes: relabel them on the new grid instead of running the model again
      if (this.bpNotes) (a as AnalysisResult & { transcription?: unknown }).transcription = domain.transcriptionFromNotes(a, gridOf(a), this.bpNotes, NOTES_METHOD);
      this.show(a); this.save(a); this.ctl = null; this.running = false;
      void this.transcribeNotes(job);
      return true;
    } catch (e) {
      const err = e as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!current() || (err && err.name === "AbortError")) return false;
      this.ctl = null; this.running = false; this.status = { text: "Couldn't analyse again (" + (err && err.message ? err.message.slice(0, 80) : "error") + "). Nothing was changed.", err: true }; this.progress = 0; return false;
    }
  }
  /** The user corrected the tempo: analyse again at it when the audio is here, otherwise mark what depends on it stale. */
  async correctTempo(bpm: number) {
    const to = Math.round(bpm * 10) / 10; if (!(to >= 50 && to <= 220) || !this.result) return false;
    return this.canRecompute ? this.reanalyze({ type: "bpm", to }) : this.replace(n => applyTempo(n, to));
  }
  /** Bar 1 is on the wrong beat: move it by `delta` beats and analyse again (needs the audio). */
  async moveBar1(delta: number) { return this.canRecompute ? this.reanalyze({ type: "downbeat", shift: delta }) : false; }
  /** "This isn't in 4/4": everything built on the analyzer's bars is then marked unreliable (it cannot read other meters). */
  setNotFourFour(on: boolean) { return this.replace(n => applyMeter(n, on)); }
  /* ---- audio for a saved teardown. A saved teardown has no audio; attaching the track again makes it playable (the playhead, loops,
     beat clicks, the loudness shape). Before enabling playback the file must match: the same length (within 0.15 s: a different export of the same song can differ by a few tens of milliseconds, but anything more would put the playhead out of step) and the same loudest
     sample, measured exactly as the analysis measured it (peakDb). That is a cheap fingerprint, not proof of identity, and it says so. */
  async attachAudio(file: File | undefined | null): Promise<boolean> {
    const cur = this.result as AnalysisResult | null; if (!file || !cur || this.running) return false;
    const fmt = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
    const done = pending("Comparing the file with this teardown…");
    const say = (text: string, ok = false) => { done(ok ? "success" : "error", text); return ok; };
    let ab: AudioBuffer;
    try { ab = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(await file.arrayBuffer()); }
    catch { return say("Couldn't read that file. Try the MP3 or WAV the teardown was made from."); }
    if (Math.abs(ab.duration - cur.duration) > 0.15) return say(`That file is ${fmt(ab.duration)} long, but this teardown is ${fmt(cur.duration)}. It looks like a different track or a different cut, so playback stays off.`);
    const L = ab.getChannelData(0), R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L; let peak = 0;
    for (let i = 0; i < L.length; i += 2) { const p = Math.max(Math.abs(L[i] ?? 0), Math.abs(R[i] ?? 0)); if (p > peak) peak = p; }
    const pk = +(20 * Math.log10(peak + 1e-9)).toFixed(1);
    if (typeof cur.peakDb === "number" && Math.abs(pk - cur.peakDb) > 0.3) return say(`Same length, but its loudest peak is ${pk} dBFS and this teardown's was ${cur.peakDb}. It looks like a different recording or master, so playback stays off.`);
    if (this.result !== cur) return false; // another teardown was opened meanwhile
    const old = this.audioURL; this.audioURL = URL.createObjectURL(file); this.buffer = ab;
    const next = copy(cur); Object.defineProperty(next, "__buf", { value: ab, enumerable: false, configurable: true });
    this.show(next); if (old) URL.revokeObjectURL(old);
    return say(`Audio attached: it matches (same length and loudest peak${typeof cur.peakDb === "number" ? "" : "; this save has no peak to compare, so only the length was checked"}). Nothing was uploaded.`, true);
  }
  /** The name field was edited: before a track it names the next analysis, after one it renames the teardown on screen. */
  nameEdited() { this.titleTyped = true; }
  rename() {
    const t = this.title.trim();
    if (!this.result || this.running) return false;
    if (!t || t === this.result.title) { this.title = this.result.title; this.titleTyped = false; return false; }
    this.titleTyped = false;
    return this.replace(n => { n.title = t; });
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
