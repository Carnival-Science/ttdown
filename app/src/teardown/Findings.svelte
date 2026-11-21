<!-- What was found in the whole track, each finding labelled by how it is known (Measured / Estimated / Assumed / Unknown), with the
     corrections that belong to it. The inspector shows the essentials and the control for each (tempo, key, meter and bar 1); the
     explanations, alternatives and the measured sound fold away until asked for. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import Icon from "../lib/ui/Icon.svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  import { engine } from "../lib/engine";
  import { gridOf } from "../lib/timeline/grid";
  import { drone } from "../lib/audio/drone.svelte";
  import Basis from "../lib/ui/Basis.svelte";

  const { fmtT, BANDS, applyKey } = domain as any;
  const NAMES = engine.NAMES as string[];
  const a = $derived(teardown.result as any);
  const G = $derived(gridOf(a) as any);
  const tempo = $derived.by(() => { try { return G.map.tempo(); } catch { return null; } });
  const fixes = $derived((a.timingCorrections || []) as any[]);
  const bpmFixes = $derived(fixes.filter(c => c.type === "bpm")), moved = $derived(fixes.filter(c => c.type === "downbeat").reduce((p, c) => p + (c.shift || 0), 0));
  const corrected = $derived(bpmFixes.length > 0);
  const edits = $derived(fixes.some(c => c.type === "chord" || c.type === "drum"));
  const busy = $derived(teardown.running);
  const others = $derived(((tempo?.hypotheses || []) as any[]).filter(h => h.role !== "selected" && h.bpm >= 50 && h.bpm <= 220).map(h => +h.bpm.toFixed(1)));
  const pct = (v: number) => (v * 100 < 0.1 ? "under 0.1" : (v * 100).toFixed(1));
  const keyOpts = $derived([a.key].concat((a.altKeys || []).map((k: any) => k.key)).filter((k: string, i: number, arr: string[]) => arr.indexOf(k) === i).slice(0, 4));
  const allKeys = NAMES.flatMap(n => [n + " major", n + " minor"]);
  const setKey = (k: string) => teardown.replace(n => { applyKey(n, k); });
  const retempo = (bpm: number) => { void teardown.correctTempo(bpm); };
  let typed = $state("");
  $effect(() => { typed = String(a.bpm); });
</script>

<div class="findings">
  <div class="finding" data-finding="tempo">
    <div class="fhead"><h3>Tempo</h3>{#if corrected}<Basis kind="corrected" />{:else}<Basis kind="estimated" />{/if}</div>
    <p class="bigline"><span class="big mono">{a.bpm} <small>BPM</small></span>
      {#if G.kind !== "tracked"}<span class="small chip">Constant</span>
      {:else if tempo?.isConstant}<span class="small chip">Steady</span>
      {:else if tempo}<span class="small chip warn">Variable {tempo.min.toFixed(0)}–{tempo.max.toFixed(0)}</span>{/if}</p>
    <div class="row tight">
      <button class="btn" aria-label="Double the BPM" disabled={busy || a.bpm * 2 > 220} onclick={() => retempo(a.bpm * 2)}>× 2</button>
      <button class="btn" aria-label="Halve the BPM" disabled={busy || a.bpm / 2 < 50} onclick={() => retempo(a.bpm / 2)}>÷ 2</button>
      <input type="number" min="50" max="220" step="0.1" bind:value={typed} aria-label="Type the BPM" class="bpmin">
      <button class="btn" type="button" disabled={busy} onclick={() => retempo(parseFloat(typed))}>Set BPM</button>
    </div>
    {#if !teardown.canRecompute}<p class="small">The audio isn't here, so a corrected tempo can't be analysed again: what depends on it is marked out of date.</p>{/if}
    <details class="more"><summary>Why this tempo</summary>
      {#if G.kind !== "tracked"}
        <p class="small">The beat positions were not saved with this teardown, so bars use one constant tempo.</p>
      {:else if tempo?.isConstant}
        <p class="small">Steady: the tracked beats stay within {pct(tempo.maxDeviation)}% of this tempo.</p>
      {:else if tempo?.changes?.length}
        <p class="small">Not steady: it changes {tempo.changes.length} time{tempo.changes.length === 1 ? "" : "s"}, between {tempo.min.toFixed(0)} and {tempo.max.toFixed(0)} BPM. One fixed tempo does not describe this track.</p>
      {:else if tempo}
        <p class="small">Not steady: it varies between {tempo.min.toFixed(0)} and {tempo.max.toFixed(0)} BPM.</p>
      {/if}
      {#if others.length && !corrected}<p class="small">It could also be {others.join(" or ")} BPM; the tracker can't rule that out. If the song feels twice as fast or half as fast, use × 2 or ÷ 2.</p>{/if}
      {#if teardown.canRecompute}<p class="small">Correcting the tempo analyses the track again at it.{#if edits} Chord and drum edits will be discarded.{/if}</p>{/if}
    </details>
  </div>

  <div class="finding" data-finding="key">
    <div class="fhead"><h3>Key</h3>{#if a.keyFixed}<Basis kind="corrected" />{:else}<Basis kind="estimated" />{/if}</div>
    <p class="bigline"><span class="big">{a.key}</span></p>
    <select class="isel" aria-label="Set the key yourself" onchange={e => { const v = e.currentTarget.value; if (v) setKey(v); e.currentTarget.value = ""; }}>
      <option value="">Set key…</option>{#each allKeys as k (k)}<option value={k}>{k}</option>{/each}
    </select>
    <details class="more"><summary>Other keys and listening</summary>
      {#if a.keyFixed}
        <p class="small">Set by you.</p>
      {:else}
        <p class="small">{a.key} and {a.relKey} use the same notes, so the analyzer can't always tell which is home. {#if (a.altKeys || []).some((k: any) => k.key !== a.relKey)} Other keys it considered: {(a.altKeys || []).map((k: any) => k.key).filter((k: string) => k !== a.relKey).join(", ")}.{/if}</p>
      {/if}
      <div class="keyopts">
        {#each keyOpts as k (k)}
          <span class="row tight">
            <button class="btn drone-btn" type="button" onclick={() => drone.toggle(k)}>{#if drone.playing === k}<Icon name="stop" /> Stop{:else}<Icon name="play" /> {k}{/if}</button>
            {#if k !== a.key}<button class="btn" type="button" onclick={() => setKey(k)}>Use</button>{/if}
          </span>
        {/each}
      </div>
    </details>
  </div>

  <div class="finding" data-finding="meter">
    <div class="fhead"><h3>Meter and bar 1</h3>{#if a.notFourFour}<Basis kind="corrected" />{:else}<Basis kind="assumed" note="The analyzer assumes four beats per bar. It does not detect the meter." />{/if}</div>
    <p class="bigline"><span class="big">{a.notFourFour ? "Not 4/4" : "4/4"}</span></p>
    <label class="small tick"><input type="checkbox" checked={!!a.notFourFour} onchange={e => teardown.setNotFourFour(e.currentTarget.checked)}> This track isn't in 4/4</label>
    <p class="small bar1">Bar 1 at {a.firstDown < 0 ? "−" : ""}{Math.abs(a.firstDown).toFixed(2)} s {#if moved % 4}<Basis kind="corrected" note="You moved bar 1; the track was analysed again with it there." />{:else}<Basis kind="estimated" note="The first downbeat the analyzer chose. Check it with the beat clicks." />{/if}</p>
    <div class="row tight">
      <button class="btn" type="button" aria-label="Move bar 1 one beat earlier" disabled={busy || !teardown.canRecompute} onclick={() => teardown.moveBar1(-1)}><Icon name="chevron-left" /> One beat earlier</button>
      <button class="btn" type="button" aria-label="Move bar 1 one beat later" disabled={busy || !teardown.canRecompute} onclick={() => teardown.moveBar1(1)}>One beat later <Icon name="chevron-right" /></button>
    </div>
    {#if !teardown.canRecompute}<p class="small">Moving bar 1 analyses the track again, so it needs the audio: upload it again.</p>{/if}
    <details class="more"><summary>About the meter</summary>
      {#if !a.notFourFour}<p class="small">Four beats per bar is assumed: the analyzer does not detect meter, so a track in 3/4, 5/4 or 6/8 will be read as 4/4 and its bars will be wrong.</p>{/if}
      <p class="small">Length {fmtT(a.duration)} <Basis kind="measured" />, {a.nBars} bars at the detected tempo.</p>
    </details>
  </div>

  <details class="more sound"><summary>Measured sound <Basis kind="measured" /></summary>
    <div class="finding" data-finding="level">
      <div class="fhead"><h3>Level and dynamics</h3><Basis kind="measured" /></div>
      <dl class="facts mono">
        <dt>Loud-part level</dt><dd>{a.loudRms} dBFS</dd>
        <dt>Peak</dt><dd>{a.peakDb} dBFS</dd>
        <dt>Crest factor</dt><dd>{a.crest} dB</dd>
        <dt>Stereo width</dt><dd>{a.width}</dd>
      </dl>
      <p class="small">Level is the RMS of the loudest parts. Crest factor is how far peaks rise above that level (lower means more compressed). Width runs from 0 (mono) up; 0.5 and above is very wide.</p>
    </div>
    <div class="finding" data-finding="bands">
      <div class="fhead"><h3>Energy by frequency band</h3><Basis kind="measured" /></div>
      <div class="bars">
        {#each a.balance as v, i (i)}
          <div class="bar"><span>{BANDS[i]}</span><div class="track"><div class="fill" style:width={Math.min(100, v * 2.2) + "%"}></div></div><span class="num">{v + "%"}</span></div>
        {/each}
      </div>
    </div>
  </details>
</div>

<style>
  .findings { display: grid; gap: 0; min-width: 0; }
  .finding { padding: 8px 0; gap: 6px; }
  .finding:first-child { padding-top: 0; }
  .bigline { margin: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .big { font-size: 1.45rem; }
  .findings :global(.btn) { min-height: 36px; padding: 0 12px; font-size: .84rem; }
  .findings :global(.isel) { min-height: 36px; }
  .chip { padding: 1px 6px; border-radius: 2px; border: 1px solid var(--tt-line); color: var(--tt-ink-2); }
  .chip.warn { border-color: color-mix(in srgb, var(--tt-warn) 55%, transparent); color: var(--tt-warn); }
  .row.tight { gap: 6px; flex-wrap: wrap; }
  .bpmin { width: 76px; }
  .bar1 { margin: 0; }
  .keyopts { display: grid; gap: 6px; margin-top: 8px; }
  .more { font-size: var(--tt-fs-sm); }
  .more > summary { cursor: pointer; color: var(--tt-ink-2); min-height: 28px; display: flex; align-items: center; gap: 8px; }
  .more > summary:hover { color: var(--tt-ink); }
  .more[open] > summary { margin-bottom: 6px; }
  .more p { margin: 6px 0 0; }
  .more.sound { border-top: 1px solid var(--tt-line); padding-top: 8px; }
  .more.sound .finding { padding: 8px 0 4px; border-top: 0; }
  @media (min-width: 1180px) and (max-height: 820px) {
    .finding { padding: 6px 0; gap: 4px; }
    .big { font-size: 1.2rem; }
    .fhead h3 { font-size: .92rem; }
    .findings :global(.btn), .findings :global(.isel) { min-height: 32px; }
    .more > summary { min-height: 22px; }
  }
</style>
