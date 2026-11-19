<!-- The selected section: its rhythm, harmony and rough notes. Each tab says how it is known, and says "unknown" where the analyzer
     found nothing, instead of filling the space. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import type { Snippet } from "svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { player } from "../lib/state/player.svelte";
  import { patternPlayer } from "../lib/audio/pattern.svelte";
  import { domain } from "../lib/domain";
  import Tabs from "../lib/ui/Tabs.svelte";
  import Basis from "../lib/ui/Basis.svelte";
  import Rack from "../lib/ui/music/Rack.svelte";
  import NotesEditor from "./NotesEditor.svelte";
  import { exportState } from "../lib/state/exportState.svelte";
  import { drums } from "../lib/state/drums.svelte";
  import { sectionName } from "../lib/timeline/sections";
  import { saveFile, safeName } from "../lib/files/download";

  let { index, tools }: { index: number; tools?: Snippet } = $props();
  const { fmtT, keyChords, chordNotes, keyInfo, chordFromDegree, recomputeLoop, recordCorrection, staleReasons, partMidi, chordNamesText } = domain as any;
  const a = $derived(teardown.result as any);
  const s = $derived(a.sections[index] as any);
  const playable = $derived(!!teardown.audioURL);
  const stale = $derived(staleReasons(a) as string[]);
  const why = $derived(stale.includes("tempo") ? "you corrected the tempo and the audio isn't here to analyse again" : "you said this track isn't in 4/4, which the analyzer can't read");
  const ALL_TABS = [{ value: "rhythm", label: "Rhythm" }, { value: "harmony", label: "Harmony" }, { value: "notes", label: "Notes" }];
  // no kick or snare anywhere in the track: the Rhythm tab (and its empty drum grid) steps aside; Explorer says so and offers it back
  const TABS = $derived(drums.hidden ? ALL_TABS.filter(t => t.value !== "rhythm") : ALL_TABS);
  let tab = $state<string | null>("rhythm");
  $effect(() => { if (drums.hidden && tab === "rhythm") tab = "harmony"; });

  // ---- per-part MIDI: the same writer, grid tempo and export gate as the Export panel (nothing here can lift a stale or refused grid)
  let midiNote = $state("");
  $effect(() => { void index; midiNote = ""; });
  const base = $derived(safeName(a.title, "song"));
  async function downloadPart(part: "hook" | "bass" | "chords") {
    const g = exportState.gate; if (!g.canExport) return;
    try {
      const m = partMidi(a, part, { tempo: g.tempo, section: s }); if (!m) { midiNote = "There is nothing to write for this part."; return; }
      await saveFile(`${base} - ${m.name}`, m.data, "audio/midi");
      midiNote = part === "chords" ? "Saved. One suggested triad per bar from this section's first bar, not transcribed from the audio." : "Saved. A rough, 4-bar phrase snapped to the 16th-note grid, starting at its first bar. Not the original timing.";
    } catch (e) { midiNote = "Couldn't save the file" + ((e as Error)?.message ? ": " + (e as Error).message.slice(0, 80) : "."); }
  }
  async function copyChords() {
    const text = chordNamesText(a, s);
    try { await navigator.clipboard.writeText(text); midiNote = "Copied: " + text; } catch { midiNote = "Couldn't copy. The chords are: " + text; }
  }

  // ---- rhythm
  const gh = $derived(a.pattern.ghost || {});
  const edited = (lane: string) => (i: number, val: boolean) => teardown.replace(x => {
    const y: any = x; y.patternEdited = true; recordCorrection(y, { type: "drum", lane, step: i, from: !val, to: val }); y.pattern[lane][i] = val; if (y.pattern.ghost && y.pattern.ghost[lane]) y.pattern.ghost[lane][i] = false;
    (y.drumParts || []).forEach((pt: any) => { if (pt.kick.some(Boolean) || pt.snare.some(Boolean)) pt[lane][i] = val; });
  });
  const part = $derived(((a.drumParts || []) as any[]).find(pt => s.startBar >= pt.startBar && s.startBar < pt.startBar + pt.bars));
  const same = (p: any, q: any) => ["kick", "snare", "hats"].every(k => p[k].join() === q[k].join());
  const none = $derived(!!part && !part.kick.some(Boolean) && !part.snare.some(Boolean));

  // ---- harmony
  const ch = $derived(a.chords as any), bars = $derived(((ch && ch.bars) || []) as string[]);
  const inKey = $derived(keyChords(a.key) as Set<string>);
  const count = $derived.by(() => { const c: Record<string, number> = {}; bars.forEach(x => { if (x && x !== "–") c[x] = (c[x] || 0) + 1; }); return c; });
  const shaky = (c: string) => !!c && c !== "–" && (!inKey.has(c) || count[c]! <= 2);
  const barList = $derived(Array.from({ length: Math.max(0, Math.min(s.startBar + s.bars, bars.length) - s.startBar) }, (_, k) => s.startBar + k));
  let cur = $state<number | null>(null);
  $effect(() => { void index; cur = null; });
  const checks = $derived((a.chordChecks || {}) as Record<string, string>);
  const opts = $derived.by(() => { const k = keyInfo(a); return Array.from({ length: 7 }, (_, d) => chordFromDegree(k, d, false).name as string); });
  function hear(b: number) { cur = b; if (!playable) return; const st = (a.firstDown || 0) + b * a.barSec; player.loopRange?.(st, st + a.barSec, 0.75); player.overlayOnly?.("chords"); }
  function setChord(name: string, mark: string) { const b = cur; if (b == null) return; teardown.replace(x => { const y: any = x; recordCorrection(y, { type: "chord", bar: b, from: y.chords.bars[b], to: name }); y.chords.bars[b] = name; y.chordChecks = { ...(y.chordChecks || {}), [b]: mark }; recomputeLoop(y); }); player.overlayRestart?.(); }
  function sounds() { const b = cur; if (b == null) return; teardown.replace(x => { const y: any = x; y.chordChecks = { ...(y.chordChecks || {}), [b]: "ok" }; }); }

</script>


{#snippet bar()}
  {#if tools}{@render tools()}{/if}
  <div class="dsec">
    <h3 class="dtitle" title={`${fmtT(s.start)}–${fmtT(s.end)}`}>{sectionName(s.label, a)} <span class="small mono">bars {s.startBar + 1}–{s.startBar + s.bars}</span></h3>
    {#if playable}<div class="row" style="gap:6px"><button class="btn cool" type="button" onclick={() => player.seek(s.start)}>▶ Play from here</button><button class="btn" type="button" onclick={() => player.loopSection?.(index, 1)}>Loop section</button></div>{/if}
  </div>
{/snippet}

<div class="detail" data-section={index}>
  <Tabs items={TABS} label="Parts of this section" listClass="dtabs" bind:value={tab} trailing={bar}>
    {#snippet panel(item)}
      {#if stale.length}
        <div class="dpanel" data-part={item.value} data-stale="1">
          <div class="row"><b>{item.label}</b><Basis kind="stale" /></div>
          <p class="notice">Out of date: {why}. What was worked out here belonged to the bars the analyzer detected, so it is hidden instead of shown as if it still matched. {#if stale.includes("tempo")}Upload the track again to analyse it at your tempo.{:else}Untick “This track isn't in 4/4” to see it again.{/if}</p>
        </div>
      {:else if item.value === "rhythm"}
        <div class="dpanel" data-part="rhythm">
          <div class="row"><b>Drums</b><Basis kind="estimated" note="A one-bar, 16-step pattern: a step is on if a hit appears in most bars." /></div>
          {#if none}
            <p>No kick or snare was found in this section. <Basis kind="unknown" note="Drums may be absent here, or too quiet or too washed out to detect." /></p>
          {:else if part && same(part, a.pattern)}
            <p class="small">This section plays the main groove.</p>
          {:else if part}
            <p class="small">This section's drums differ from the main groove:</p>
            <Rack rows={[{ name: "Kick", steps: part.kick }, { name: "Snare / clap", steps: part.snare }, { name: "Hi-hats", steps: part.hats }]} />
          {/if}
          <details class="more"><summary>About this pattern</summary><p class="small">Main groove: one bar, four squares per beat. Orange hits appear in most bars; dim ones are ghost notes. {a.pattern.tracked ? `Found by following the beat through ${a.pattern.bars} bars. ` : ""}Click a square to correct it; the change applies to the whole track.</p></details>
          <Rack rows={[{ name: "Kick", steps: a.pattern.kick, onEdit: edited("kick") }, { name: "Snare / clap", steps: a.pattern.snare, ghost: gh.snare, onEdit: edited("snare") }, { name: "Hi-hats", steps: a.pattern.hats, ghost: gh.hats, onEdit: edited("hats") }]} />
          <div class="row"><button class="btn cool" onclick={() => patternPlayer.toggle(a)}>{patternPlayer.on ? "■ Stop" : "▶ Hear this pattern at " + a.bpm + " BPM"}</button></div>
          <p class="small">{#if a.swing}Swing: the in-between 16th notes land about {Math.round(a.swing.late * 100)}% of a step late (0% is straight).{:else}Swing: unknown, there were not enough in-between notes to measure it.{/if}</p>
        </div>
      {:else if item.value === "harmony"}
        <div class="dpanel" data-part="harmony">
          <div class="row"><b>Chords</b><Basis kind="estimated" note="One major or minor triad per bar, chosen from the audio's pitch content. Seventh chords, inversions and modal chords are not detected." /></div>
          {#if !bars.length}
            <p>No chords were found. <Basis kind="unknown" /></p>
          {:else}
            {#if ch.loop}<p class="small">Most repeated 4-bar loop: <b class="mono">{ch.loop.join(" · ")}</b> (heard {ch.loopCount}×).</p>{/if}
            <div class="row" style="gap:8px">
              <button class="btn" type="button" disabled={!exportState.gate.canExport} title={exportState.lockedWhy || "Download these chords as a .mid file (suggested voicings)"} onclick={() => downloadPart("chords")}>⬇ Chords MIDI · bars {s.startBar + 1}–{s.startBar + s.bars}</button>
              <button class="btn" type="button" onclick={copyChords}>Copy chord names</button>
            </div>
            {#if exportState.lockedWhy}<p class="small">MIDI is locked: {exportState.lockedWhy} <a href="#exports">Go to Export</a></p>{/if}
            {#if midiNote}<p class="small" role="status">{midiNote}</p>{/if}
            <details class="more"><summary>How to read the squares</summary><p class="small">One square per bar. Click a bar to hear it with the detected chord played over the song. <span class="sw shaky"></span>? marks a shaky guess (rare, or outside {a.key}); <span class="sw none"></span>· means no clear chord (unknown).</p></details>
            <div class="chrow wide">
              {#each barList as b (b)}
                {@const c = bars[b]!}{@const nochord = !c || c === "–"}{@const sh = shaky(c)}
                <button type="button" class={"chcell" + (nochord ? " none" : "") + (sh ? " shaky" : "") + (checks[b] ? " " + checks[b] : "") + (cur === b ? " cur" : "")} title={nochord ? `Bar ${b + 1}: no clear chord` : `Bar ${b + 1}: ${c} (${chordNotes(c)})${sh ? " · shaky guess" : ""}`} onclick={() => hear(b)}><span class="chnum">{b + 1}</span><b>{nochord ? "·" : c + (sh ? "?" : "")}</b></button>
              {/each}
            </div>
            {#if cur != null}
              <div class="row" style="gap:8px">
                <b>Bar {cur + 1}: {bars[cur]}</b>
                <button class="btn" type="button" onclick={sounds}>✓ Sounds right</button>
                <select class="isel" aria-label="Change this bar's chord" value="" onchange={e => { const v = e.currentTarget.value; if (v) setChord(v, "fixed"); e.currentTarget.value = ""; }}>
                  <option value="">Change chord…</option>{#each opts as o (o)}<option value={o}>{o}</option>{/each}<option value="–">No chord</option>
                </select>
              </div>
            {/if}
          {/if}
        </div>
      {:else}
        <div class="dpanel" data-part="notes"><NotesEditor {index} /></div>
      {/if}
    {/snippet}
  </Tabs>
</div>

<style>
  .detail { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--tt-line); padding-top: 10px; min-width: 0; }
  .dsec { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-left: auto; }
  .dtitle { font-size: 1rem; }
  .more { font-size: var(--tt-fs-sm); }
  .more > summary { cursor: pointer; color: var(--tt-ink-3); min-height: 24px; }
  .more > summary:hover { color: var(--tt-ink); }
  .more[open] > summary { margin-bottom: 4px; }
  .dsec :global(.btn) { min-height: 36px; padding: 0 12px; }
  @media (max-width: 1179px) { .detail { display: block; } .detail :global(.tt-tabs) { margin-top: 4px; } .dsec { margin-left: 0; width: 100%; } .dsec :global(.btn) { min-height: 40px; } }
</style>
