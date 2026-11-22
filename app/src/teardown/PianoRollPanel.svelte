<!-- The piano roll: the transcribed notes (deep lime), the transcribed bass (dark ink-green) and SUGGESTED chord voicings (grey, hollow outlines,
     because they are built from the detected chord names, not heard in the audio) on ONE keyboard, pitch axis and time axis, sharing the
     arrangement's viewport and its one playhead. A chord strip above the notes names each chord where it sounds (several in a bar when the analysis
     hears the chord change inside it), marks the one under the playhead
     and opens the chord correction when clicked. Parts can be shown, hidden or soloed (Alt/Option-click). "↓ MIDI ▾" writes any ticked combination of parts (one part: one file; several: one multitrack
     file, or a zip with a file each), for the selected section, the visible range or the whole track, with a choice of timing; every mode
     that is unavailable says why. Inspection only: no note editing. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import Icon from "../lib/ui/Icon.svelte";
  import { untrack } from "svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { transport } from "../lib/state/transport.svelte";
  import { exportState } from "../lib/state/exportState.svelte";
  import { player } from "../lib/state/player.svelte";
  import { domain } from "../lib/domain";
  import { engine } from "../lib/engine";
  import { gridOf } from "../lib/timeline/grid";
  import { barBeat, barTicks, gridLines, timeAtBeat } from "../lib/timeline/position";
  import { saveFile, safeName } from "../lib/files/download";
  import { notify } from "../lib/ui/toast";
  import Basis from "../lib/ui/Basis.svelte";
  import Segmented from "../lib/ui/Segmented.svelte";
  import Popover from "../lib/ui/Popover.svelte";
  import MultiRoll from "../lib/ui/timeline/MultiRoll.svelte";
  import { confirmAt } from "../lib/ui/confirm";
  import type { RollLayer, AnnotationLane, Annotation, LaneNote } from "../lib/ui/timeline/MultiRoll.svelte";

  let { index }: { index: number } = $props();
  const D = domain as any;
  const { partMidi, keyChords, chordNotes, keyInfo, chordFromDegree, recomputeLoop, recordCorrection, chordNamesText, chordTimingText, chordTimingCsv } = D;
  const a = $derived(teardown.result as any);
  const s = $derived(a.sections[index] as any);
  const G = $derived(gridOf(a));
  const view = transport.view;
  const playable = $derived(!!teardown.audioURL);
  const NAMES = engine.NAMES as readonly string[];
  const noteName = (m: number) => (NAMES[((m % 12) + 12) % 12] ?? "?") + (Math.floor(m / 12) - 1);

  // ---- the notes
  const full = $derived((a.transcription && a.transcription.version === 1 ? a.transcription : null) as { lead: any[]; bass: any[]; method: string } | null);
  const hook = $derived(a.hook && a.hook.notes && a.hook.notes.length >= 3 ? a.hook : null);
  const bassPat = $derived(a.bassline && a.bassline.notes && a.bassline.notes.length >= 2 ? a.bassline : null);
  let want = $state<"full" | "pattern">("full");
  const source = $derived(full && want === "full" ? "full" : "pattern");
  const fromFull = (list: any[]): LaneNote[] => list.map(n => ({ start: n.on, end: n.off, pitch: n.midi, level: Math.min(1, (n.vel || 90) / 127) }));
  // the 4-bar phrase was read from `bar` (1-based) and folded into 16 beats: place it where it was read
  const fromPattern = (p: any): LaneNote[] => p ? p.notes.map((n: any) => ({ start: timeAtBeat(G, a, (p.bar - 1) * 4 + n.t / 4), end: timeAtBeat(G, a, (p.bar - 1) * 4 + (n.t + Math.max(0.5, n.dur ?? n.len ?? 1)) / 4), pitch: n.midi })) : [];
  const leadNotes = $derived(source === "full" ? fromFull(full!.lead) : fromPattern(hook));
  const bassNotes = $derived(source === "full" ? fromFull(full!.bass) : fromPattern(bassPat));
  const patternAt = (p: any) => p ? { from: p.bar, to: p.bar + 3, t: timeAtBeat(G, a, (p.bar - 1) * 4) } : null;
  const where = $derived(patternAt(hook) ?? patternAt(bassPat));

  // ---- the chords where they sound: the analyzer's chord regions (a chord where it changes, which need not be a bar line) when the
  // teardown has them, else one per bar; a bar the person corrected keeps their chord (domain chordSpans). Voiced as the same
  // root-position triad the chord MIDI writes (48 + root).
  type Span = { bar: number; s: number; e: number; t0: number; t1: number; c: string; corrected: boolean };
  const chordBars = $derived(((a.chords && a.chords.bars) || []) as string[]);
  const spans = $derived.by(() => { void a.timingCorrections; void chordBars; return (D.chordSpans(a, G) || []) as Span[]; });
  const regions = $derived(!!(a.chordRegions && a.chordRegions.regions && a.chordRegions.regions.length));
  const isChord = (c: string | undefined) => !!c && c !== "–";
  const triad = (c: string): number[] => { const p = D.chordParse(c); return p.root < 0 ? [] : p.intervals.map((d: number) => 48 + p.root + d); };   // the chord's notes: a triad, or four for a seventh chord
  const barT = (b: number) => G.barStart(b);
  // The voicings of bars the person corrected are their own layer (drawn solid and dark), apart from the suggested ones (hollow purple): what the
  // analyzer suggested and what you decided never look alike.
  const voicings = (yours: boolean) => { const out: LaneNote[] = []; spans.forEach(sp => { if (!(sp.t1 > sp.t0) || sp.corrected !== yours) return; for (const p of triad(sp.c)) out.push({ start: sp.t0, end: sp.t1, pitch: p }); }); return out; };
  const chordNotesSuggested = $derived(voicings(false));
  const chordNotesYours = $derived(voicings(true));
  const chordNotesAll = $derived([...chordNotesSuggested, ...chordNotesYours]);
  const inKey = $derived(keyChords(a.key) as Set<string>);
  const count = $derived.by(() => { const c: Record<string, number> = {}; spans.forEach(x => { c[x.c] = (c[x.c] || 0) + 1; }); return c; });
  const shaky = (c: string) => isChord(c) && (!inKey.has(c) || count[c]! <= 2);
  const checks = $derived((a.chordChecks || {}) as Record<string, string>);

  // ---- which parts are shown (Alt/Option-click shows only that one; again brings the others back)
  type Part = "hook" | "bass" | "chords";
  // a polyphonic model (Basic Pitch) writes every note it hears, split at C3: the upper part is "Notes", not a melody
  const poly = $derived(!!(full && (full as any).polyphonic));
  const PARTS = $derived<{ id: Part; label: string; cls: string }[]>([{ id: "hook", label: poly ? "Notes" : "Melody", cls: "sw-mel" }, { id: "bass", label: "Bass", cls: "sw-bass" }, { id: "chords", label: "Chords (suggested)", cls: "sw-ch" }]);
  let show = $state<Record<Part, boolean>>({ hook: true, bass: true, chords: true });
  const has = $derived<Record<Part, boolean>>({ hook: leadNotes.length > 0, bass: bassNotes.length > 0, chords: chordNotesAll.length > 0 });
  function toggle(p: Part, e: MouseEvent) {
    if (!e.altKey) return; e.preventDefault();
    const solo = (Object.keys(show) as Part[]).every(k => show[k] === (k === p));
    show = solo ? { hook: true, bass: true, chords: true } : { hook: p === "hook", bass: p === "bass", chords: p === "chords" };
  }
  // While the note model (Basic Pitch) works on the whole track, the notes on screen are the quick analysis's rough draft, and so are the
  // chords (they are re-read from the model's notes when it lands, PR 51): all of it is drawn faint and a strip above the roll says a
  // better transcription is coming, with its progress. When it lands, the strip says so for a few seconds.
  const drafting = $derived(teardown.transcribing);
  let upgraded = $state(false);
  $effect(() => { const t = teardown.notesUpgradedAt; if (!t) { upgraded = false; return; } const left = 6000 - (Date.now() - t); if (left <= 0) { upgraded = false; return; } upgraded = true; const id = setTimeout(() => (upgraded = false), left); return () => clearTimeout(id); });
  const noteOpacity = $derived(drafting ? 0.38 : 1);
  const layers = $derived<RollLayer[]>([
    { id: "chords", label: "Suggested chord voicings", notes: chordNotesSuggested, hidden: !show.chords, fill: "#8A6BC9", fillOpacity: 0, stroke: drafting ? "#C4B4E4" : "#8A6BC9", strokeWidth: 1.2 },
    { id: "chords-yours", label: "Your chord voicings", notes: chordNotesYours, hidden: !show.chords, fill: "#2B2F2A", fillOpacity: 0.16, stroke: "#2B2F2A", strokeWidth: 1.6 },
    { id: "bass", label: "Bass", notes: bassNotes, hidden: !show.bass, fill: "#4E8A3E", fillOpacity: noteOpacity },
    { id: "hook", label: poly ? "Notes" : "Melody", notes: leadNotes, hidden: !show.hook, fill: "#526BCE", fillOpacity: noteOpacity },
  ]);

  // ---- chord strip and the correction it opens
  let cur = $state<number | null>(null), curKey = $state<string | null>(null);
  $effect(() => { void index; cur = null; curKey = null; });
  const posText = (sp: Span) => { const q = ((sp.s % 16) + 16) % 16; return sp.bar < 0 ? "Pickup" : `Bar ${sp.bar + 1}` + (q ? ` beat ${Math.floor(q / 4) + 1}${q % 4 === 2 ? "&" : q % 4 ? "+" : ""}` : ""); };
  const opts = $derived.by(() => { const k = keyInfo(a); return Array.from({ length: 7 }, (_, d) => chordFromDegree(k, d, false).name as string); });
  const strip = $derived<AnnotationLane[]>(spans.length ? [{
    id: "chords", label: "Chord", selected: curKey,
    items: spans.map((sp): Annotation => {
      const sh = shaky(sp.c), where = posText(sp);
      return { key: String(sp.s), start: sp.t0, end: sp.t1, text: sp.c + (sh ? "?" : ""), tone: [sh ? "shaky" : "", sp.corrected ? "fixed" : "", checks[sp.bar] || ""].filter(Boolean).join(" "),
        title: `${where}: ${sp.c} (${chordNotes(sp.c)})${sh ? " · shaky guess" : ""}${sp.corrected ? " · your correction" : ""}.${sp.bar >= 0 ? ` Click to check or correct bar ${sp.bar + 1}.` : ""}`,
        attrs: { "data-bar": String(sp.bar), "data-step": String(sp.s) } };
    }),
    onpick: it => { const b = +(it.attrs?.["data-bar"] ?? -1); if (b < 0) return; cur = b; curKey = String(it.key); },
  }] : []);
  // the chords sounding in the bar being corrected, in order
  const inBar = $derived(cur == null ? [] : spans.filter(sp => sp.s < (cur! + 1) * 16 && sp.e > cur! * 16).map(sp => sp.c).filter((c, i, A) => i === 0 || c !== A[i - 1]));
  function hear(b: number) { if (!playable) return; player.loopRange?.(barT(b), barT(b + 1), 0.75); player.overlayOnly?.("chords"); }
  function setChord(name: string, mark: string) { const b = cur; if (b == null) return; teardown.replace(x => { const y: any = x; recordCorrection(y, { type: "chord", bar: b, from: y.chords.bars[b], to: name }); y.chords.bars[b] = name; y.chordChecks = { ...(y.chordChecks || {}), [b]: mark }; recomputeLoop(y); }); player.overlayRestart?.(); }
  function sounds() { const b = cur; if (b == null) return; teardown.replace(x => { const y: any = x; y.chordChecks = { ...(y.chordChecks || {}), [b]: "ok" }; }); }

  // ---- axis, readout and seeking
  let rulerW = $state(600);
  const lines = (from: number, to: number) => gridLines(G, a, from, to);
  const ticks = $derived(barTicks(G, a, view.start, view.end, Math.max(200, rulerW)));
  function seek(t: number) { const el = document.querySelector("#explorer audio") as HTMLAudioElement | null; if (el) el.currentTime = Math.min(Math.max(0, t), (a.duration || 1) - 0.05); }
  const zoomBy = (f: number) => view.zoom(f, transport.clock && view.contains(transport.clock.time) ? transport.clock.time : view.start + view.span / 2);
  // where the playhead is: bar.beat and the chord sounding there (updated when it changes, not every frame)
  let here = $state("");
  const chordAt = (t: number) => spans.find(sp => t >= sp.t0 && t < sp.t1)?.c;
  const readout = (t: number) => { const p = barBeat(G, a, t), c = chordAt(t); if (!p) return "Before bar 1" + (c ? ` · ${c}` : ""); return `Bar ${p.bar}.${Math.floor(p.beat)}` + (isChord(c) ? ` · ${c}` : ""); };
  $effect(() => { const c = transport.clock; void G; void spans; if (!c) { here = readout(view.start); return; } return untrack(() => c.subscribe(t => { const r = readout(t); if (r !== here) here = r; })); });

  // ---- MIDI: part, range and timing. Quantized MIDI keeps the one export gate; original timing and the tempo map have their own availability.
  type Timing = "original" | "tempo-map" | "quantized";
  type Mode = { ok: boolean; why: string; refTempo?: number | null; caveats?: string[]; parts?: Record<Part, boolean> };
  const NOT_YET: Mode = { ok: false, why: "Not available in this version yet.", caveats: [] };
  const modes = $derived.by((): { original: Mode; tempoMap: Mode } => {
    if (typeof D.midiModes !== "function") return { original: NOT_YET, tempoMap: NOT_YET };
    try { const m = D.midiModes(a, G, exportState.confirmed); return { original: m.original, tempoMap: m.tempoMap }; } catch { return { original: NOT_YET, tempoMap: NOT_YET }; }
  });
  const okOf = (t: Timing) => t === "quantized" ? exportState.gate.canExport : t === "tempo-map" ? modes.tempoMap.ok : modes.original.ok;
  const whyOf = (t: Timing) => t === "quantized" ? exportState.lockedWhy : t === "tempo-map" ? modes.tempoMap.why : modes.original.why;
  const fallback = $derived<Timing>(exportState.gate.canExport ? "quantized" : modes.tempoMap.ok ? "tempo-map" : modes.original.ok ? "original" : "quantized");
  let timingPick = $state<Timing | null>(null);
  const timing = $derived<Timing>(timingPick && okOf(timingPick) ? timingPick : fallback);
  const refTempo = $derived(modes.original.refTempo != null ? Math.round(modes.original.refTempo * 10) / 10 : null);

  // Which parts to write: any combination. One part is one small file; two or three are one multitrack file, or one file each in a zip.
  const PART_IDS: Part[] = ["hook", "bass", "chords"];
  let picked = $state<Record<Part, boolean>>({ hook: true, bass: false, chords: false });
  let layoutPick = $state<"one" | "zip">("one");
  // original timing and the tempo map need notes at their real times: an older teardown without a transcription has chords only there
  const timedParts = $derived(timing === "quantized" ? null : (timing === "tempo-map" ? modes.tempoMap.parts : modes.original.parts) ?? null);
  const baseOk = (p: Part) => p === "hook" ? !!(full?.lead.length || hook) : p === "bass" ? !!(full?.bass.length || bassPat) : chordBars.some(isChord);
  const partOk = (p: Part): boolean => baseOk(p) && (!timedParts || !!timedParts[p]);
  const partWhy = (p: Part) => {
    if (!baseOk(p)) return p === "chords" ? "No chords were found." : "No notes were found for this part.";
    return "Needs whole-track notes, which this teardown doesn't have: analyse the track again, or use Quantized for the 4-bar phrase.";
  };
  /** The ticked parts that can be written in the chosen timing (a ticked part that is unavailable there is shown unticked and greyed, and is not written). */
  const chosen = $derived(PART_IDS.filter(p => picked[p] && partOk(p)));
  const layout = $derived<"one" | "zip">(chosen.length > 1 ? layoutPick : "one");

  type RangePick = "section" | "visible" | "whole";
  let rangePick = $state<RangePick>("section");
  const visibleBars = (): [number, number] => { const b0 = Math.max(0, G.barOf(view.start)), b1 = Math.min(a.nBars + 1, G.barOf(view.end - 0.001) + 1); return [b0, Math.max(b0 + 1, b1)]; };
  const rangeOf = (r: RangePick): [number, number] => r === "section" ? [s.startBar, s.startBar + s.bars] : r === "visible" ? visibleBars() : [0, a.nBars + 1];
  // the whole track has no range: the domain then starts the file at the pickup bar when notes come before bar 1, so a pickup is kept
  const hasPickup = $derived(!!a.transcription && [...(a.transcription.lead || []), ...(a.transcription.bass || [])].some(n => n.bar < 0));
  const rangeText = (r: RangePick) => { const [b0, b1] = rangeOf(r); return r === "whole" ? `bars 1–${a.nBars}${hasPickup ? " + pickup" : ""}` : `bars ${b0 + 1}–${b1}`; };

  let menuOpen = $state(false);
  const base = $derived(safeName(a.title, "song"));
  const SHORT: Record<Part, string> = { hook: "Notes", bass: "Bass", chords: "Chords" };
  const WORDS: Record<Timing, string> = { original: "original timing", "tempo-map": "tempo map", quantized: "quantized" };
  const shortOf = (p: Part) => p === "hook" && !poly ? "Melody" : SHORT[p];
  const chosenText = $derived(chosen.length === 3 ? "all 3 parts" : chosen.map(shortOf).join(" + "));
  async function download() {
    const t = timing, ids = chosen;
    if (!ids.length) { notify("warning", "Tick at least one part to download."); return; }
    // decided again at the click, from the same rules the menu shows
    if (!okOf(t)) { notify("warning", "That timing isn't available: " + whyOf(t)); return; }
    const [startBar, endBar] = rangeOf(rangePick), range = rangePick === "whole" ? undefined : { startBar, endBar };
    const tempo = t === "quantized" ? exportState.gate.tempo : undefined;
    const one = (p: Part) => partMidi(a, p, { timing: t, grid: G, range, section: rangePick === "whole" ? undefined : s, tempo, withParts: ids, source: full && p !== "chords" ? "transcribed" : undefined });
    const clean = (n: string) => n.replace(/[\\/:*?"<>|]+/g, "");
    try {
      let data: Uint8Array | null, fileName = "", mime = "audio/midi", refT: number | null = null, skipped: Part[] = [];
      if (ids.length === 1) { const m = one(ids[0]!); data = m ? m.data : null; fileName = m ? `${base} - ${m.name}` : ""; }
      else if (layout === "one") { const m = D.allPartsMidi(a, { timing: t, grid: G, range, tempo, parts: ids }); data = m ? m.data : null; fileName = m ? clean(m.name) : ""; refT = m?.refTempo ?? null; }
      else {
        const files = ids.map(p => ({ p, m: one(p) })); skipped = files.filter(f => !f.m).map(f => f.p); const made = files.filter(f => f.m);
        data = made.length ? D.zipStore(made.map(f => ({ name: `${base} - ${f.m.name}`, data: f.m.data }))) : null; mime = "application/zip";
        fileName = clean(`${base} - ${made.map(f => shortOf(f.p)).join(" + ")} ${rangeText(rangePick)} (${WORDS[t]}).zip`);
      }
      if (!data) { notify("warning", ids.length > 1 ? "There is nothing to write for these parts in that range." : "There is nothing to write for this part in that range."); return; }
      await saveFile(fileName, data, mime); menuOpen = false;
      confirmAt(document.querySelector(".phead .midi"));
      const rt = refT != null ? Math.round(refT * 10) / 10 : refTempo;
      const how = t === "quantized" ? `snapped to the 16th-note grid at ${Math.round((exportState.gate.tempo || a.bpm) * 10) / 10} BPM, not the original timing` : t === "tempo-map" ? "following the song's tempo map" : `with the original timing${rt ? `; it plays in time at ${rt} BPM (set your DAW to it, or import the file's tempo)` : ""}`;
      const where = ids.length === 1 ? "" : layout === "zip" ? ` as ${ids.length - skipped.length} files in a zip` : ` as one multitrack file`;
      notify("success", `Saved ${ids.length === 1 ? "" : chosenText}${where}, ${how}.` + (ids.includes("chords") ? " Chords are suggested voicings built from the detected chord names, not transcribed from the audio." : "") + (ids.some(p => p !== "chords") ? " The notes are a rough transcription." : "") + (skipped.length ? ` Nothing to write for ${skipped.map(shortOf).join(", ")} in that range, so it was left out.` : ""));
    } catch (e) { notify("error", "Couldn't save the file" + ((e as Error)?.message ? ": " + (e as Error).message.slice(0, 80) : ".")); }
  }
  async function copyChords() {
    const text = chordNamesText(a, s);
    try { await navigator.clipboard.writeText(text); notify("success", "Copied: " + text); } catch { notify("warning", "Couldn't copy. The chords are: " + text); }
  }
  async function copyChordTiming() {
    const text = chordTimingText(a, s, G);
    if (!text) { notify("warning", "There are no chords in this section."); return; }
    try { await navigator.clipboard.writeText(text); notify("success", "Copied the chords with their times, in the audio's own timing."); } catch { notify("warning", "Couldn't copy. The chords are:\n" + text); }
  }
  async function saveChordCsv() {
    const csv = chordTimingCsv(a, s, G);
    if (csv.split("\n").length < 3) { notify("warning", "There are no chords in this section."); return; }
    try { await saveFile(`${base} - chords bars ${s.startBar + 1}-${s.startBar + s.bars} (timed).csv`.replace(/[\\/:*?"<>|]+/g, ""), csv, "text/csv"); notify("success", "Saved the chord list with bar, beat and seconds, in the audio's own timing."); } catch (e) { notify("error", "Couldn't save the file" + ((e as Error)?.message ? ": " + (e as Error).message.slice(0, 80) : ".")); }
  }
  const TIMINGS: { id: Timing; label: string }[] = [{ id: "original", label: "Original timing" }, { id: "tempo-map", label: "Follow tempo map" }, { id: "quantized", label: "Quantized" }];
  const PART_PICKS = $derived<{ id: Part; label: string }[]>([{ id: "hook", label: poly ? "Notes (above C3)" : "Melody" }, { id: "bass", label: "Bass" }, { id: "chords", label: "Chords (suggested)" }]);
  const RANGES: { id: RangePick; label: string }[] = [{ id: "section", label: "Selected section" }, { id: "visible", label: "Visible range" }, { id: "whole", label: "Whole track" }];
  const nothing = $derived(!has.hook && !has.bass && !has.chords);
  const missing = $derived(PARTS.filter(p => !has[p.id]).map(p => p.id === "chords" ? "chords" : p.label.toLowerCase()));
</script>

<div class="proll">
  <div class="phead">
    <h3 class="sr-only">Piano roll</h3>
    <Basis kind="estimated" note={source === "full" && poly ? "Notes and bass are transcribed from the whole track by Spotify's Basic Pitch, a model that runs in this browser: every note it hears, split at C3. Expect some wrong, missing and extra notes, and rough lengths. Chord voicings are suggestions built from the detected chord names." : source === "full" ? "Melody and bass are a rough transcription of the whole track from the full mix: expect wrong and missing notes. Chord voicings are suggestions built from the detected chord names." : "Melody and bass are a rough 4-bar phrase read from the full mix and folded into a loop, shown where it was read. Chord voicings are suggestions."} />
    <span class="parts" role="group" aria-label="Parts shown (Alt/Option-click one to show only it)">
      {#each PARTS as p (p.id)}
        <label class="part" title="Alt/Option-click to show only this part; again to show all" data-part-toggle={p.id}>
          <input type="checkbox" bind:checked={show[p.id]} disabled={!has[p.id]} onclick={e => toggle(p.id, e)} /><i class={"sw " + p.cls}></i>{p.label}
        </label>
      {/each}
    </span>
    <span class="here mono" data-readout aria-live="off">{here}</span>
    <span class="zoom" role="group" aria-label="Zoom the piano roll">
      <button type="button" class="btn" aria-label="Zoom out" onclick={() => zoomBy(2)}>−</button>
      <button type="button" class="btn" aria-label="Zoom in" onclick={() => zoomBy(0.5)}>+</button>
      <button type="button" class="btn" onclick={() => view.fit()}>Fit</button>
    </span>
    <Popover triggerClass="btn about" label="About the piano roll" class="about-pop" align="end">
      {#snippet trigger()}<Icon name="info" />{/snippet}
      <p class="small">{#if source === "full" && poly}Notes are transcribed by Spotify's Basic Pitch, run in this browser ({full?.method}): every note it hears, with the notes below C3 shown as Bass and the rest as Notes. It is a general model, checked so far on one clean synthesized track only: expect wrong, missing and extra notes, and rough lengths.{:else if source === "full"}Melody and bass are read from the whole mix ({full?.method}). Rough: dense mixes make them hard to hear, and this has not been checked against real recordings.{:else}Melody and bass are a 4-bar phrase read from one section and folded into a loop, so they are not the song's notes bar by bar. {#if !full}This teardown was made before whole-track notes existed; analyse the track again to get them.{/if}{/if}
        The grey outlined notes are suggested voicings: plain triads built from the chord names (major or minor only), not notes heard in the audio. {#if a.chordRegions?.method === "chords-from-notes-v1"}The chord names are read from the transcribed notes above (checked on one piece only; where the notes are wrong the chords will be too).{:else}The chord names are detected from the audio.{/if}{#if regions} Each chord starts where the analysis hears the harmony change, which can be inside a bar.{/if}
        {#if a.chords?.loop}Most repeated 4-bar chord loop: <b class="mono">{a.chords.loop.join(" · ")}</b> (heard {a.chords.loopCount}×).{/if}
        Scroll with Shift + wheel or by dragging, zoom with Ctrl/⌘ + wheel or the buttons. Use "Check by ear" to hear the parts over the song.</p>
      <ul class="key" aria-label="How each mark on the roll is known" data-provenance-key>
        <li><i class="kk heard"></i><span><b>{poly ? "Notes" : "Melody"}</b>: heard by the analyzer. Estimated: expect wrong, missing and extra notes.</span></li>
        <li><i class="kk bass"></i><span><b>Bass</b>: heard by the analyzer. Estimated.</span></li>
        <li><i class="kk name">Am</i><span><b>Chord name</b>: inferred from the sound. Estimated; a “?” marks a shaky guess.</span></li>
        <li><i class="kk suggest"></i><span><b>Hollow purple outline</b>: a suggested voicing built from the chord name. Not heard in the audio.</span></li>
        <li><i class="kk yours"></i><span><b>Dark outline and a dot</b>: your correction. What depends on it was recomputed, or is marked out of date.</span></li>
        <li><i class="kk name">–</i><span><b>Blank or “–”</b>: nothing could be read reliably there. Unknown, not silence.</span></li>
      </ul>
      {#if full}<Segmented class="srcseg" label="Which notes" items={[{ value: "full", label: "Full track" }, { value: "pattern", label: "Representative pattern" }]} value={source} onchange={v => (want = v as "full" | "pattern")} />{/if}
    </Popover>
    <Popover bind:open={menuOpen} triggerClass="btn midi" label="Download MIDI: choose the part, range and timing" class="midi-pop" align="end" side="bottom" disabled={nothing}>
      {#snippet trigger()}<Icon name="download" /> MIDI <Icon name="chevron-down" />{/snippet}
      <div class="mcols"><div class="mcol">
      <fieldset><legend>Parts <span class="dim">· tick any combination</span></legend>
        {#each PART_PICKS as o (o.id)}
          <label class="opt" class:off={!partOk(o.id)}><input type="checkbox" name="midi-part" value={o.id} checked={picked[o.id] && partOk(o.id)} disabled={!partOk(o.id)} onchange={e => (picked[o.id] = e.currentTarget.checked)} /><span>{o.label}{#if !partOk(o.id)}<em class="why">{partWhy(o.id)}</em>{/if}</span></label>
        {/each}
      </fieldset>
      {#if chosen.length > 1}
        <fieldset data-layout><legend>Write {chosen.length} parts as</legend>
          <label class="opt"><input type="radio" name="midi-layout" value="one" checked={layout === "one"} onchange={() => (layoutPick = "one")} /><span>One multitrack file<em class="hint">Each part on its own track, in one .mid.</em></span></label>
          <label class="opt"><input type="radio" name="midi-layout" value="zip" checked={layout === "zip"} onchange={() => (layoutPick = "zip")} /><span>One file per part (.zip)<em class="hint">Separate .mid files to drag in one at a time.</em></span></label>
        </fieldset>
      {/if}
      <fieldset><legend>Range</legend>
        {#each RANGES as o (o.id)}
          <label class="opt"><input type="radio" name="midi-range" value={o.id} checked={rangePick === o.id} onchange={() => (rangePick = o.id)} /><span>{o.label} <span class="mono dim">· {rangeText(o.id)}</span></span></label>
        {/each}
      </fieldset>
      </div><div class="mcol">
      <fieldset><legend>Timing</legend>
        {#each TIMINGS as o (o.id)}
          {@const ok = okOf(o.id)}
          <label class="opt" class:off={!ok} data-timing={o.id}><input type="radio" name="midi-timing" value={o.id} checked={timing === o.id} disabled={!ok} onchange={() => (timingPick = o.id)} />
            <span>{o.label}
              {#if !ok}<em class="why">{whyOf(o.id)}</em>
              {:else if o.id === "original" && refTempo}<em class="hint">Plays in time at {refTempo} BPM; set your DAW to this tempo or import the file's tempo.</em>
              {:else if o.id === "tempo-map" && modes.tempoMap.caveats?.length}<em class="hint">{modes.tempoMap.caveats.join(" ")}</em>
              {:else if o.id === "quantized"}<em class="hint">Snapped to the 16th-note grid at one tempo.</em>{/if}
            </span></label>
        {/each}
      </fieldset>
      </div></div>
      <div class="mfoot">
      <button type="button" class="btn primary dl" disabled={!okOf(timing) || !chosen.length} onclick={download}>{chosen.length ? `Download ${chosenText} · ${rangeText(rangePick)}${layout === "zip" ? " (.zip)" : ""}` : "Tick a part to download"}</button>
      <button type="button" class="btn" onclick={copyChords}>Copy this section's chord names</button>
      <button type="button" class="btn" onclick={copyChordTiming}>Copy chords with times</button>
      <button type="button" class="btn" onclick={saveChordCsv}>Save chord list (.csv)</button>
      </div>
    </Popover>
  </div>

  {#if nothing}
    <p>No melody, bass or chords could be read reliably. <Basis kind="unknown" /></p>
  {:else}
    {#if source === "pattern" && where}<p class="small pat">Representative pattern: 4 bars read from bars {where.from}–{where.to}, shown where it was read. <button type="button" class="btn" onclick={() => view.reveal(where.t, 0.05)}>Go to bars {where.from}–{where.to}</button></p>{/if}
    {#if drafting}
      <div class="draft" role="status" data-draft>
        <span class="dmark" aria-hidden="true"></span>
        <p><b>These notes and chords are a quick draft.</b> A more accurate transcription of the whole track is running in this browser and will replace them automatically.</p>
        <span class="dpct mono" aria-label={`${teardown.progress}% done`}>{teardown.progress}%</span>
        <span class="dbar" aria-hidden="true"><i style:transform={`scaleX(${Math.max(0.02, teardown.progress / 100)})`}></i></span>
      </div>
    {:else if upgraded}
      <div class="draft done" role="status" data-notes-updated>
        <span class="dmark" aria-hidden="true"></span>
        <p><b>Notes and chords updated.</b> The notes are now transcribed from the whole track by Basic Pitch, and the chords are read from them.</p>
      </div>
    {/if}
    <div class="lanes" bind:clientWidth={rulerW} data-source={source} data-vp-start={view.start.toFixed(3)} data-vp-span={view.span.toFixed(3)} data-follow={view.follow ? "1" : "0"}>
      <MultiRoll viewport={view} clock={transport.clock} {layers} annotations={strip} {lines} {ticks} pitchName={noteName} label="Piano roll" empty="No notes in this stretch"
        onseek={playable ? (t => seek(t)) : undefined} />
    </div>
    {#if cur != null}
      <div class="fix" role="group" aria-label={`Bar ${cur + 1} chord`}>
        <b>Bar {cur + 1}: {inBar.length ? inBar.join(" → ") : "no clear chord"}</b>{#if inBar.length === 1}<span class="small dim">({chordNotes(inBar[0])})</span>{:else if inBar.length > 1}<span class="small dim">A correction sets one chord for the whole bar.</span>{/if}
        <button class="btn" type="button" onclick={sounds}><Icon name="check" /> Sounds right</button>
        <select class="isel" aria-label="Change this bar's chord" value="" onchange={e => { const v = e.currentTarget.value; if (v) setChord(v, "fixed"); e.currentTarget.value = ""; }}>
          <option value="">Change chord…</option>{#each opts as o (o)}<option value={o}>{o}</option>{/each}<option value="–">No chord</option>
        </select>
        {#if playable}<button class="btn" type="button" onclick={() => hear(cur!)}><Icon name="play" /> Hear this bar with the chord</button>{/if}
        <button class="btn close" type="button" aria-label="Close the chord correction" onclick={() => { cur = null; curKey = null; }}><Icon name="close" /></button>
      </div>
    {/if}
    {#if missing.length}<p class="small missing">Not found: {missing.join(", ")}. <Basis kind="unknown" note="The analyzer could not read these reliably from the mix, so nothing is drawn for them." /></p>{/if}
    {#if exportState.lockedWhy}<p class="small">Quantized MIDI is unavailable: {exportState.lockedWhy}</p>{/if}
  {/if}
</div>

<style>
  .proll { display: grid; gap: 8px; min-width: 0; }
  .phead { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  .phead :global(.btn) { min-height: 32px; padding: 0 8px; }
  .phead :global(.about) { width: 32px; padding: 0; justify-content: center; }
  .parts { display: inline-flex; flex-wrap: wrap; gap: 4px 12px; }
  .part { display: inline-flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--tt-ink-2); cursor: pointer; user-select: none; min-height: 28px; }
  .part input { accent-color: var(--tt-accent); margin: 0; }
  .part:has(input:disabled) { opacity: .45; cursor: default; }
  .here { margin-left: auto; color: var(--tt-ink); font-size: .82rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .zoom { display: inline-flex; gap: 4px; }
  .sw { display: inline-block; width: 12px; height: 8px; border-radius: 2px; vertical-align: 0; }
  .sw-mel { background: var(--tt-part-notes); } .sw-bass { background: var(--tt-part-bass); }
  .sw-ch { background: transparent; border: 1.2px solid var(--tt-part-chords); box-sizing: border-box; }
  .pat { margin: 0; }
  /* the roll takes what the window leaves after the transport, the song map and the tabs (about 400 px), never less than 260 px */
  /* the draft strip: cobalt (it is about state, not data), one line, the progress as a hairline along its bottom */
  .draft { position: relative; display: flex; align-items: center; gap: 10px; margin: 0; padding: 8px 12px 10px; background: color-mix(in srgb, var(--tt-cobalt) 9%, var(--tt-panel)); color: var(--tt-ink); font-size: var(--tt-fs-sm); overflow: hidden; animation: draft-in 260ms cubic-bezier(.23, 1, .32, 1); }
  .draft p { margin: 0; flex: 1; min-width: 0; }
  .draft b { font-weight: 400; }
  .dmark { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--tt-cobalt); animation: draft-pulse 1.6s ease-in-out infinite; }
  .dpct { flex: none; font-variant-numeric: tabular-nums; color: var(--tt-cobalt); font-weight: 400; }
  .dbar { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: color-mix(in srgb, var(--tt-cobalt) 18%, transparent); }
  .dbar i { display: block; height: 100%; background: var(--tt-cobalt); transform-origin: left center; transition: transform 300ms linear; }
  .draft.done { background: color-mix(in srgb, var(--tt-good) 10%, var(--tt-panel)); }
  .draft.done .dmark { background: var(--tt-good); animation: none; }
  @keyframes draft-in { from { opacity: 0; translate: 0 -4px; } }
  @keyframes draft-pulse { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { .draft, .dmark { animation: none; } .dbar i { transition: none; } }
  .lanes { height: clamp(260px, calc(100dvh - 400px), 900px); min-width: 0; --tl-ann-ink: var(--tt-ink-2); }
  .lanes :global(.ann-item.shaky) { color: var(--tt-warn); }
  .lanes :global(.ann-item.none) { color: var(--tt-ink-3); }
  .lanes :global(.ann-item.fixed) { text-decoration: underline dotted; }
  .lanes :global(.ann-item.fixed)::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 4px; border-radius: 50%; background: #2B2F2A; vertical-align: 1px; }
  .key { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; }
  .key li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 6px; align-items: start; }
  .kk { display: block; width: 18px; height: 9px; margin-top: 4px; border-radius: 2px; box-sizing: border-box; }
  .kk.heard { background: #526BCE; } .kk.bass { background: #4E8A3E; }
  .kk.suggest { border: 1.2px solid #8A6BC9; } .kk.yours { border: 1.6px solid #2B2F2A; background: rgb(43 47 42 / .16); }
  .kk.name { height: auto; margin-top: 0; font: 400 .7rem var(--tt-font-mono); color: var(--tt-ink-2); }
  .fix { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  .fix .close { margin-left: auto; }
  .dim { color: var(--tt-ink-3); }
  :global(.about-pop) { max-width: 360px; max-height: min(var(--available-height, 78dvh), 640px); overflow-y: auto; padding: 8px 12px; }
  :global(.about-pop p) { margin: 0; }
  :global(.tt-pop.midi-pop) { display: grid; gap: 8px; padding: 12px 12px; width: min(580px, 94vw); max-width: min(580px, 94vw); }
  :global(.midi-pop .mcols) { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
  :global(.midi-pop .mcol) { display: grid; gap: 8px; align-content: start; }
  :global(.midi-pop .mfoot) { display: flex; flex-wrap: wrap; gap: 8px; border-top: 1px solid var(--tt-line); padding-top: 8px; }
  @media (max-width: 560px) { :global(.midi-pop .mcols) { grid-template-columns: 1fr; } }
  :global(.midi-pop fieldset) { border: 0; margin: 0; padding: 0; display: grid; gap: 2px; }
  :global(.midi-pop legend) { font-size: .72rem; color: var(--tt-ink-3); margin-bottom: 2px; }
  :global(.midi-pop .opt) { display: grid; grid-template-columns: 18px 1fr; gap: 6px; align-items: start; padding: 4px 2px; font-size: .84rem; cursor: pointer; }
  :global(.midi-pop .opt input) { margin: 3px 0 0; accent-color: var(--tt-accent); }
  :global(.midi-pop .opt.off) { color: var(--tt-ink-3); cursor: default; }
  :global(.midi-pop .why), :global(.midi-pop .hint) { display: block; font-style: normal; font-size: .74rem; color: var(--tt-ink-3); }
  :global(.midi-pop .why) { color: var(--tt-warn); }
  :global(.midi-pop .dim) { color: var(--tt-ink-3); }
  :global(.midi-pop .dl) { justify-content: center; }
  :global(.srcseg .tt-seg-item) { height: 30px; font-size: .78rem; padding: 0 8px; }
  @media (max-width: 1179px) { .lanes { height: 300px; } .here { margin-left: 0; } }
</style>
