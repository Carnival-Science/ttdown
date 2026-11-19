<!-- The Notes editor: the top line and the bass as piano rolls on the SAME time axis as the arrangement. They share one viewport (zoom and
     scroll) and one playhead driven by the audio. Full-track notes (a.transcription) are shown at their real positions; without them (older
     teardowns) the 4-bar representative pattern is shown where it was read, and says so. Playback never depends on export: the playhead
     moves on a changing-tempo track too, because time and position come from the TimeMap grid, not a fixed bar length. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { transport } from "../lib/state/transport.svelte";
  import { exportState } from "../lib/state/exportState.svelte";
  import { domain } from "../lib/domain";
  import { engine } from "../lib/engine";
  import { gridOf } from "../lib/timeline/grid";
  import { barBeat, barTicks, gridLines, timeAtBeat } from "../lib/timeline/position";
  import { saveFile, safeName } from "../lib/files/download";
  import Basis from "../lib/ui/Basis.svelte";
  import Segmented from "../lib/ui/Segmented.svelte";
  import Popover from "../lib/ui/Popover.svelte";
  import NoteLane from "../lib/ui/timeline/NoteLane.svelte";
  import TimeRuler from "../lib/ui/timeline/TimeRuler.svelte";
  import Playhead from "../lib/ui/timeline/Playhead.svelte";
  import type { LaneNote } from "../lib/ui/timeline/NoteLane.svelte";

  let { index }: { index: number } = $props();
  const { partMidi } = domain as any;
  const a = $derived(teardown.result as any);
  const s = $derived(a.sections[index] as any);
  const G = $derived(gridOf(a));
  const view = transport.view;
  const noteName = (m: number) => (engine.NAMES[((m % 12) + 12) % 12] ?? "?") + (Math.floor(m / 12) - 1);

  // ---- what there is to show
  const full = $derived((a.transcription && a.transcription.version === 1 ? a.transcription : null) as { lead: any[]; bass: any[]; method: string; grid: string } | null);
  const hook = $derived(a.hook && a.hook.notes && a.hook.notes.length >= 3 ? a.hook : null);
  const bass = $derived(a.bassline && a.bassline.notes && a.bassline.notes.length >= 2 ? a.bassline : null);
  let want = $state<"full" | "pattern">("full");
  const source = $derived(full && want === "full" ? "full" : "pattern");
  const fromFull = (list: any[]): LaneNote[] => list.map(n => ({ start: n.on, end: n.off, pitch: n.midi, level: Math.min(1, (n.vel || 90) / 127) }));
  // the 4-bar phrase was read from `bar` (1-based) and folded into 16 beats: place it where it was read
  const fromPattern = (p: any): LaneNote[] => p ? p.notes.map((n: any) => ({ start: timeAtBeat(G, a, (p.bar - 1) * 4 + n.t / 4), end: timeAtBeat(G, a, (p.bar - 1) * 4 + (n.t + Math.max(0.5, n.dur ?? n.len ?? 1)) / 4), pitch: n.midi, mark: !!n.glide })) : [];
  const leadNotes = $derived(source === "full" ? fromFull(full!.lead) : fromPattern(hook));
  const bassNotes = $derived(source === "full" ? fromFull(full!.bass) : fromPattern(bass));
  const patternAt = (p: any) => p ? { from: p.bar, to: p.bar + 3, t: timeAtBeat(G, a, (p.bar - 1) * 4) } : null;
  const where = $derived(patternAt(hook) ?? patternAt(bass));
  const nothing = $derived(!full && !hook && !bass);

  // ---- the shared axis
  let rulerW = $state(0);
  const lines = (from: number, to: number) => gridLines(G, a, from, to);
  const ticks = $derived(barTicks(G, a, view.start, view.end, Math.max(200, rulerW)));
  const here = $derived(barBeat(G, a, view.start));
  function seek(t: number) { const el = transport.clock && (document.querySelector("#explorer audio") as HTMLAudioElement | null); if (el) el.currentTime = Math.min(Math.max(0, t), (a.duration || 1) - 0.05); }
  const canSeek = $derived(!!teardown.audioURL);
  // wheel: ctrl/cmd zooms around the pointer, shift (or a sideways wheel) scrolls; plain wheel scrolls the editor up and down
  let lanesEl = $state<HTMLDivElement | null>(null);
  const gutter = 40;
  $effect(() => {
    const el = lanesEl; if (!el) return;
    const h = (e: WheelEvent) => {
      const r = el.getBoundingClientRect(), w = Math.max(1, r.width - gutter), t = view.tOf(e.clientX - r.left - gutter, w);
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); view.zoom(Math.exp(e.deltaY * 0.0025), t); }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); view.pan(((e.shiftKey ? e.deltaY : e.deltaX) / w) * view.span); }
    };
    el.addEventListener("wheel", h, { passive: false }); return () => el.removeEventListener("wheel", h);
  });
  // drag a lane sideways to scroll it
  let drag: { x: number; start: number; moved: boolean } | null = null;
  function pd(e: PointerEvent) { if ((e.target as HTMLElement).closest("button")) return; drag = { x: e.clientX, start: view.start, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function pm(e: PointerEvent) {
    if (!drag || !lanesEl) return; const dx = e.clientX - drag.x; if (!drag.moved && Math.abs(dx) < 4) return; drag.moved = true;
    const w = Math.max(1, lanesEl.getBoundingClientRect().width - gutter); view.follow = false; view.jump(drag.start - (dx / w) * view.span);
  }
  const pu = () => { drag = null; };
  const zoomBy = (f: number) => view.zoom(f, transport.clock && view.contains(transport.clock.time) ? transport.clock.time : view.start + view.span / 2);

  // ---- MIDI: the same writer, grid tempo and export gate as the Export panel (nothing here lifts a stale or refused grid)
  let note = $state("");
  $effect(() => { void index; note = ""; });
  const base = $derived(safeName(a.title, "song"));
  const bars = $derived({ sec: [s.startBar, s.startBar + s.bars] as [number, number] });
  function visibleBars(): [number, number] { const b0 = Math.max(0, G.barOf(view.start)), b1 = Math.min(a.nBars + 1, G.barOf(view.end - 0.001) + 1); return [b0, Math.max(b0 + 1, b1)]; }
  async function download(part: "hook" | "bass", range?: [number, number]) {
    const g = exportState.gate; if (!g.canExport) return;
    try {
      const opts: any = { tempo: g.tempo };
      if (source === "full") { opts.source = "transcribed"; if (range) opts.range = { startBar: range[0], endBar: range[1] }; } else opts.section = s;
      const m = partMidi(a, part, opts); if (!m) { note = "There is nothing to write for this part."; return; }
      await saveFile(`${base} - ${m.name}`, m.data, "audio/midi");
      note = source === "full" ? "Saved: rough notes from the whole-track transcription, on the 16th-note grid, starting at the first bar of the range." : "Saved. A rough, 4-bar phrase snapped to the 16th-note grid, starting at its first bar. Not the original timing.";
    } catch (e) { note = "Couldn't save the file" + ((e as Error)?.message ? ": " + (e as Error).message.slice(0, 80) : "."); }
  }
  let menuOpen = $state<Record<"hook" | "bass", boolean>>({ hook: false, bass: false });
</script>

{#snippet midiBtn(part: "hook" | "bass")}
  {#if source === "full"}
    <Popover bind:open={menuOpen[part]} triggerClass="btn midi" label={`Download the ${part === "hook" ? "top line" : "bass"} as MIDI: choose a range`} class="midi-pop" align="end" side="bottom"
      disabled={!exportState.gate.canExport}>
      {#snippet trigger()}⬇ MIDI ▾{/snippet}
      <p class="small midi-head">Download as MIDI</p>
      <button type="button" class="btn" onclick={() => { menuOpen[part] = false; void download(part, bars.sec); }}>Selected section · bars {bars.sec[0] + 1}–{bars.sec[1]}</button>
      <button type="button" class="btn" onclick={() => { menuOpen[part] = false; void download(part, visibleBars()); }}>Visible range · bars {visibleBars()[0] + 1}–{visibleBars()[1]}</button>
      <button type="button" class="btn" onclick={() => { menuOpen[part] = false; void download(part, [0, a.nBars + 1]); }}>Entire track · bars 1–{a.nBars}</button>
    </Popover>
  {:else}
    <button class="btn" type="button" disabled={!exportState.gate.canExport} title={exportState.lockedWhy || "Download this phrase as a .mid file"} onclick={() => download(part)}>⬇ MIDI</button>
  {/if}
{/snippet}

{#snippet about()}
      <p class="small">{#if source === "full"}Read from the whole mix ({full?.method}). Rough: dense mixes make the top line and bass hard to hear, and this has not been checked against real recordings.{:else}A 4-bar phrase read from one section and folded into a loop, so it is not the song's notes bar by bar. {#if !full}This teardown was made before whole-track notes existed; analyse the track again to get them.{/if}{/if} Scroll with Shift + wheel or by dragging, zoom with Ctrl/⌘ + wheel or the buttons. Use "Check by ear" above to hear the parts over the song.</p>
{/snippet}

<div class="notesed">
  <div class="nhead">
    <b>Notes</b>
    <Basis kind="estimated" note={source === "full" ? "A rough transcription of the whole track from the full mix. Expect wrong and missing notes, especially where the mix is dense." : "A rough 4-bar phrase read from the full mix and folded into a loop, shown where it was read. Expect wrong and missing notes."} />
    {#if full}<Segmented class="srcseg" label="Which notes" items={[{ value: "full", label: "Full track" }, { value: "pattern", label: "Representative pattern" }]} value={source} onchange={v => (want = v as "full" | "pattern")} />{/if}
    <Popover triggerClass="btn about" label="About these notes" class="about-pop" align="start">
      {#snippet trigger()}About{/snippet}
      {@render about()}
    </Popover>
    <span class="zoom" role="group" aria-label="Zoom the editor">
      <button type="button" class="btn" aria-label="Zoom out" onclick={() => zoomBy(2)}>−</button>
      <button type="button" class="btn" aria-label="Zoom in" onclick={() => zoomBy(0.5)}>+</button>
      <button type="button" class="btn" onclick={() => view.fit()}>Fit</button>
    </span>
    <span class="small range" aria-live="off">{#if here}Bar {here.bar}{:else}Start{/if} · {Math.round(view.span / Math.max(0.1, a.barSec || 2))} bars wide</span>
  </div>

  {#if nothing}
    <p>No top line or bass notes could be read reliably. <Basis kind="unknown" /></p>
  {:else}
    {#if source === "pattern" && where}<p class="small pat">Representative pattern: 4 bars read from bars {where.from}–{where.to}, shown where it was read. <button type="button" class="btn" onclick={() => view.reveal(where.t, 0.05)}>Go to bars {where.from}–{where.to}</button></p>{/if}

    <div class="lanes" bind:this={lanesEl} style:--tl-gutter={gutter + "px"} data-source={source} data-vp-start={view.start.toFixed(3)} data-vp-span={view.span.toFixed(3)} data-follow={view.follow ? "1" : "0"}>
      <div class="rulerrow"><span class="gpad"></span><div class="rtrack" bind:clientWidth={rulerW}><TimeRuler class="laneruler" viewport={view} {ticks} height={18} onseek={canSeek ? (t => seek(t)) : undefined} /></div></div>
      {#if leadNotes.length}
        <div class="layer">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="laneh" onpointerdown={pd} onpointermove={pm} onpointerup={pu} onpointercancel={pu}>
            <div class="lh"><h3>Top line</h3>{@render midiBtn("hook")}</div>
            <NoteLane notes={leadNotes} viewport={view} {lines} pitchName={noteName} label="Piano roll of the top line" empty="No top line notes in this stretch" />
            <div class="phover"><Playhead clock={transport.clock} viewport={view} label="top line" /></div>
          </div>
        </div>
      {/if}
      {#if bassNotes.length}
        <div class="layer">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="laneh" onpointerdown={pd} onpointermove={pm} onpointerup={pu} onpointercancel={pu}>
            <div class="lh"><h3>Bass{source === "pattern" ? " (one note per 8th)" : ""}</h3>{@render midiBtn("bass")}</div>
            <NoteLane notes={bassNotes} viewport={view} {lines} pitchName={noteName} label="Piano roll of the bass" empty="No bass notes in this stretch" />
            <div class="phover"><Playhead clock={transport.clock} viewport={view} label="bass" /></div>
          </div>
        </div>
      {/if}
    </div>
    {#if exportState.lockedWhy}<p class="small">MIDI is locked: {exportState.lockedWhy} <a href="#exports">Go to Export</a></p>{/if}
    {#if note}<p class="small" role="status">{note}</p>{/if}
  {/if}
</div>

<style>
  .notesed { display: grid; gap: 8px; min-width: 0; }
  .nhead { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .nhead .zoom { display: inline-flex; gap: 4px; margin-left: auto; }
  .nhead .zoom :global(.btn), .nhead :global(.about) { min-height: 32px; padding: 0 10px; }
  .range { color: var(--tt-ink-3); white-space: nowrap; }
  .pat { margin: 0; }
  .lanes { display: grid; gap: 8px; min-width: 0; --tl-ink: var(--tt-ink-3); }
  .rulerrow { display: grid; grid-template-columns: var(--tl-gutter) minmax(0, 1fr); position: sticky; top: 0; z-index: 5; background: var(--tt-panel); }
  .rtrack { min-width: 0; }
  :global(.laneruler) { border-bottom: 1px solid #2c2f37; }
  .layer { display: grid; border: 0; padding: 0; background: none; border-radius: 0; }
  .lh { position: absolute; z-index: 6; top: 4px; left: calc(var(--tl-gutter) + 6px); right: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px; pointer-events: none; }
  .lh h3 { font-size: .78rem; padding: 2px 8px; border-radius: 6px; background: rgb(13 14 17 / .8); color: var(--tt-ink-2); }
  .lh :global(.btn) { pointer-events: auto; min-height: 26px; padding: 0 8px; font-size: .74rem; background: rgb(30 32 38 / .92); }
  :global(.about-pop) { max-width: 340px; padding: 10px 12px; }
  :global(.about-pop p) { margin: 0; }
  .laneh { position: relative; height: clamp(72px, 15dvh, 170px); touch-action: pan-y; cursor: grab; }
  .laneh:active { cursor: grabbing; }
  .phover { position: absolute; top: 0; bottom: 0; left: var(--tl-gutter); right: 0; pointer-events: none; }
  :global(.midi-pop) { display: grid; gap: 6px; padding: 10px; min-width: 230px; }
  :global(.midi-pop .btn) { justify-content: flex-start; text-align: left; }
  .midi-head { margin: 0; color: var(--tt-ink-3); }
  :global(.srcseg .tt-seg-item) { height: 30px; font-size: .78rem; padding: 0 10px; }
  @media (max-width: 1179px) { .laneh { height: 120px; } }
</style>
