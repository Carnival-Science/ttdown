<!-- Overview: the summary card, key check by ear, BPM correction, next steps (legacy render() "summary" section). -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import { player, nav } from "../lib/state/player.svelte";
  import { drone } from "../lib/audio/drone.svelte";
  import { domain } from "../lib/domain";
  import { engine } from "../lib/engine";
  import { coach } from "../lib/state/coach.svelte";

  const { GENRES, genreOf, moodTags, fmtT, applyKey, applyTempo } = domain;
  const { LIMITS, fmtLen, NAMES } = engine;
  const a = $derived(teardown.result);
  const ex = $derived(teardown.example);
  const g = $derived(GENRES[genreOf(a)]);
  const conf = (v: number, hiT: number, loT: number) => (v >= hiT ? "high confidence" : v >= loT ? "medium confidence" : "low confidence, check by ear");
  const stats = $derived([
    { big: a.bpm, label: "BPM", small: "Set FL Studio's tempo to this", conf: conf(a.bpmConf, 4, 2.5) },
    { big: a.camelot, label: a.key, small: "Relative: " + a.relKey, conf: conf(a.keyConf, 0.12, 0.06) },
    { big: g.name.split(" /")[0], label: "Likely style", small: "From tempo, drums and tone", conf: "" },
    { big: fmtT(a.duration), label: "Length", small: a.nBars + " bars of 4/4" + (a.duration > LIMITS.rhythmSeconds ? `. Tempo, beats and drums are read from the first ${fmtLen(LIMITS.rhythmSeconds)} only` : ""), conf: "" },
    { big: a.crest + " dB", label: "Punch (crest)", small: a.crest < 9 ? "Crushed loud" : a.crest > 13 ? "Dynamic" : "Typical", conf: "" },
  ]);
  const keyOpts = $derived([a.key].concat((a.altKeys || []).map(k => k.key)).filter((k, i, arr) => arr.indexOf(k) === i).slice(0, 4));
  const allKeys = NAMES.flatMap(n => [n + " major", n + " minor"]);
  const setKey = (k: string) => teardown.replace(n => { applyKey(n, k); });
  const retempo = (bpm: number) => teardown.replace(n => applyTempo(n, bpm));

  // tap tempo
  let taps: number[] = [], tapLabel = $state("Tap tempo"), tapped = $state<number | null>(null), typed = $state("");
  $effect(() => { typed = String(a.bpm); tapLabel = "Tap tempo"; tapped = null; taps = []; });
  function tap() {
    const now = performance.now(); taps = taps.filter(t => now - t < 3000); taps.push(now);
    if (taps.length >= 4) { const iv = (taps[taps.length - 1]! - taps[0]!) / (taps.length - 1); tapLabel = `Tap tempo: ${(60000 / iv).toFixed(1)} (tap more, then Use)`; tapped = +(60000 / iv).toFixed(1); }
    else tapLabel = `Tap tempo (${taps.length}/4)`;
  }
  let copied = $state(""), copyFallback = $state("");
  function copyJson() { const t = JSON.stringify(a, null, 1); navigator.clipboard.writeText(t).then(() => { copied = "Copied"; }, () => { copied = "Copy blocked: select and copy the text below"; copyFallback = t; }); }
</script>

<section class="panel" data-group="overview">
  <div class="row" style="justify-content:space-between">
    <h2>{a.title || "Your track"}</h2>
    {#if ex}<span class="tag example">Example values</span>{:else}<span class="tag">{g.name}</span>{/if}
  </div>
  <div class="stats">
    {#each stats as s (s.label)}
      <div class="stat"><b>{String(s.big)}</b><span>{s.label}</span>{#if s.small}<small>{s.small}</small>{/if}{#if s.conf}<span class="conf">{s.conf}</span>{/if}</div>
    {/each}
  </div>
  <div class="row" style="gap:6px">{#each moodTags(a) as t (t)}<span class="tag">{t}</span>{/each}</div>
  {#if !ex}
    <div class="keycheck" style="display:grid;gap:6px">
      <p class="small">{a.keyFixed ? `Key set to ${a.key} by you.` : `Check the key by ear: start the song with the button here, then play each option below. The one that sounds "at home" over the song is right. Tap “Use” to switch everything to it.`}</p>
      <div class="row" style="gap:6px">
        {#if teardown.audioURL}<button class="btn cool" type="button" onclick={() => player.toggle()}>▶ / ❚❚ Song</button>{/if}
        {#each keyOpts as k (k)}
          <span class="row" style="gap:4px">
            <button class="btn drone-btn" type="button" onclick={() => drone.toggle(k)}>{drone.playing === k ? "■ Stop" : "▶ " + k}</button>
            {#if k === a.key}<span class="tag">current</span>{:else}<button class="btn" type="button" onclick={() => setKey(k)}>Use</button>{/if}
          </span>
        {/each}
        <select aria-label="Set the key yourself" onchange={e => { const v = e.currentTarget.value; if (v) setKey(v); }}>
          <option value="">Set key…</option>
          {#each allKeys as k (k)}<option value={k}>{k}</option>{/each}
        </select>
      </div>
    </div>
    <div class="row">
      <span class="small">BPM wrong?</span>
      <button class="btn" aria-label="Double the BPM" title="Use when the song feels twice as fast as this number" disabled={a.bpm * 2 > 220} onclick={() => retempo(a.bpm * 2)}>× 2</button>
      <button class="btn" aria-label="Halve the BPM" title="Use when the song feels half as fast as this number" disabled={a.bpm / 2 < 50} onclick={() => retempo(a.bpm / 2)}>÷ 2</button>
      <button class="btn" onclick={tap}>{tapLabel}</button>
      <button class="btn primary" disabled={tapped == null} onclick={() => tapped != null && retempo(tapped)}>Use tapped BPM</button>
      <span class="row" style="gap:4px"><input type="number" min="50" max="220" step="0.1" bind:value={typed} aria-label="Type the BPM" style="width:84px"><button class="btn" type="button" onclick={() => retempo(parseFloat(typed))}>Set BPM</button></span>
    </div>
  {/if}
  <div class="row nextrow">
    <span class="small">Next:</span>
    {#if !ex}<button class="btn primary" type="button" onclick={() => nav.show("build")}>Build it step by step →</button>{/if}
    <button class="btn" type="button" onclick={() => nav.show("ideas")}>Generate ideas →</button>
    <button class="btn" type="button" onclick={() => nav.show("map")}>See the song map →</button>
    <button class="btn" type="button" onclick={() => coach.open()}>Ask the coach</button>
  </div>
  {#if ex}
    <p class="small">These are example numbers for a 125 BPM dance track, so you can see the layout. Upload a song above to get a real teardown.</p>
  {:else}
    <div class="row"><button class="btn" onclick={copyJson}>{copied || "Copy analysis (JSON)"}</button></div>
    {#if copyFallback}<textarea readonly style="height:120px">{copyFallback}</textarea>{/if}
  {/if}
</section>
