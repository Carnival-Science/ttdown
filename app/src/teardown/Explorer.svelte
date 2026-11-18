<!-- The explorer: the arrangement timeline is the central object. Click a section to select it and hear it; the player loops it, slows
     it down, plays the detected parts over the song, and clicks the tracked beats. Below the timeline, the selected section's rhythm,
     harmony and notes. Bar lines, beat clicks and "loop 4 bars" use the TimeMap grid (gridOf). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { untrack } from "svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { player } from "../lib/state/player.svelte";
  import { audio } from "../lib/audio/service.svelte";
  import { domain } from "../lib/domain";
  import { gridOf } from "../lib/timeline/grid";
  import { PlayerTools, Overlay, BeatClicks } from "../lib/audio/song-tools.svelte";
  import Basis from "../lib/ui/Basis.svelte";
  import SectionDetail from "./SectionDetail.svelte";

  const { COLORS, fmtT, staleReasons } = domain as any;
  const a = $derived(teardown.result as any);
  const stale = $derived((staleReasons(a) as string[]).length > 0);
  const dur = $derived(a.duration || 1);
  const sel = $derived(Math.min(Math.max(teardown.selected, 0), a.sections.length - 1));
  const blocks = $derived.by(() => {
    const out: { kind: "seg" | "gap"; flex: number; i?: number; s?: any }[] = []; let tCur = 0;
    const gap = (from: number, to: number) => { if (to - from > 0.05) out.push({ kind: "gap", flex: +(to - from).toFixed(3) }); };
    a.sections.forEach((s: any, i: number) => { const st = Math.max(0, s.start), en = Math.min(dur, s.end); if (en <= st) return; gap(tCur, st); out.push({ kind: "seg", flex: +(en - st).toFixed(3), i, s }); tCur = en; });
    gap(tCur, dur); return out;
  });
  const G = $derived(gridOf(a));
  const ticks = $derived.by(() => {
    const every = a.nBars > 96 ? 16 : a.nBars > 40 ? 8 : 4, out: { b: number; left: string; ext: boolean }[] = [];
    for (let b = 0, guard = 0; guard < 4000; b += every, guard++) { let t = G.barStart(b); if (t > dur) break; if (t < -0.05) continue; t = Math.max(0, t); out.push({ b, left: (100 * t / dur).toFixed(3) + "%", ext: G.tracked && G.isExtrapolated(t) }); }
    return out;
  });
  const legend = $derived(Object.keys(COLORS).filter((k, i, arr) => arr.indexOf(k) === i && k !== "Outro" && a.sections.some((s: any) => s.label === k)));
  const playable = $derived(!!teardown.audioURL);

  let audioEl = $state<HTMLAudioElement | null>(null), tl: HTMLDivElement, phLeft = $state("0%");
  let tools = $state<PlayerTools | null>(null);
  const overlay = new Overlay(), clicks = new BeatClicks();
  $effect(() => {
    const el = audioEl; if (!el) { player.el = null; return; }
    const t = new PlayerTools(untrack(() => teardown.result), el); tools = t;
    player.el = el; player.loopSection = (i, rate) => t.loopSection(i, rate); player.loopRange = (s0, s1, rate) => t.loopRange(s0, s1, rate);
    player.overlayOnly = k => overlay.only(k, teardown.result, el); player.overlayRestart = () => overlay.restart(teardown.result, el);
    const unreg = audio.player(el);
    const move = () => { phLeft = (100 * el.currentTime / ((t as any).a.duration || 1)) + "%"; }; let raf = 0;
    const loopRaf = () => { move(); if (!el.paused) raf = requestAnimationFrame(loopRaf); };
    const onPlay = () => { cancelAnimationFrame(raf); loopRaf(); };
    el.addEventListener("play", onPlay); el.addEventListener("timeupdate", move); el.addEventListener("seeked", move);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("play", onPlay); el.removeEventListener("timeupdate", move); el.removeEventListener("seeked", move); unreg(); t.destroy(); overlay.stop(); clicks.stop(); if (player.el === el) { player.el = null; player.loopSection = null; player.loopRange = null; player.overlayOnly = null; player.overlayRestart = null; } };
  });
  // a correction replaces the result: the tools keep their loop and speed, and read the new sections and grid
  $effect(() => { const r = teardown.result; if (tools) (tools as any).a = r; });
  const RATES = [0.5, 0.75, 1];
  const PARTS: [string, string][] = [["drums", "Drums"], ["bass", "Bass"], ["chords", "Chords"], ["hook", "Top line"]];
  function seekTo(e: MouseEvent) { if ((e.target as Element).closest(".seg") || !audioEl) return; const r = tl.getBoundingClientRect(); audioEl.currentTime = Math.max(0, Math.min(dur - 0.05, dur * (e.clientX - r.left) / r.width)); }
  const volume = $derived(Math.round(audio.vol.song * 100));
  function pick(i: number, s: any) { teardown.selected = i; if (playable) player.seek(s.start); }
</script>

<section class="panel explorer" id="explorer" aria-labelledby="explore-h">
  <div class="row" style="justify-content:space-between"><h2 id="explore-h">Arrangement</h2><Basis kind="estimated" note="Sections are guessed from changes in loudness and tone. Their names (Intro, Build, Drop…) are labels the analyzer gives by rule, not facts about the song." /></div>
  <p class="small">Click a section to select it{playable ? " and hear it" : ""}. Sections are guessed from changes in loudness and tone, so check the boundaries by ear.</p>
  {#if !playable}<p class="tip">Saved teardowns don't keep the audio. Upload the track again to listen.</p>{/if}

  {#if playable}
    <div class="playerbar">
      <audio controls src={teardown.audioURL} bind:this={audioEl}></audio>
      <div class="row vol" style="gap:8px">
        <label class="small" for="volume">Volume</label>
        <input id="volume" type="range" min="0" max="100" aria-label="Volume of the song and of the parts played over it" value={volume} oninput={e => audio.setAll(+e.currentTarget.value / 100)}>
        <button type="button" class="btn" id="mute" aria-pressed={audio.vol.muted} onclick={() => audio.toggleMute()}>{audio.vol.muted ? "Unmute" : "Mute"}</button>
      </div>
    </div>
    {#if tools}
      <div class="ptools">
        <div class="row" style="gap:8px">
          <span class="small">Speed</span>
          <span class="seg2">{#each RATES as r (r)}<button type="button" aria-pressed={tools.rate === r} onclick={() => tools?.setRate(r)}>{r * 100 + "%"}</button>{/each}</span>
          <select class="isel" aria-label="Loop part of the song" value={tools.loopSel} onchange={e => tools?.setLoop(e.currentTarget.value)}>
            <option value="">Loop: off</option>
            {#each a.sections as s, i (i)}<option value={String(i)}>{`Loop ${s.label} (bars ${s.startBar + 1}–${s.startBar + s.bars})`}</option>{/each}
            <option value="here">Loop 4 bars from where I am</option>
          </select>
          <button class="btn" onclick={() => clicks.toggle(a, audioEl, teardown.buffer)} disabled={!teardown.buffer}>{clicks.on ? "■ Stop" : "▶ Play with beat clicks"}</button>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn cool" type="button" disabled={stale} title={stale ? "The detected parts are out of date after your correction" : ""} onclick={() => audioEl && overlay.start(a, audioEl)}>{overlay.on ? "■ Stop checking" : "▶ Check by ear"}</button>
          <span class="small">Play the detected</span>
          <span class="seg2">{#each PARTS as [k, label] (k)}<button type="button" aria-pressed={!!(overlay.parts as any)[k]} onclick={() => { const p = overlay.parts as any; p[k] = !p[k]; }}>{label}</button>{/each}</span>
        </div>
        <p class="small">"Check by ear" plays what was detected on top of the real song, in time. If the beeps land on the song's hits, the detection is right; where they land between hits, it is wrong. Use 75% speed and loop a section while you check.</p>
      </div>
    {/if}
  {/if}

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="playhead-wrap" onclick={seekTo}>
    <div class="timeline" role="group" aria-label="Arrangement" bind:this={tl}>
      {#each blocks as k, bi (bi)}
        {#if k.kind === "gap"}<span class="seggap" style:flex={String(k.flex)} title="Before bar 1 / after the last bar"></span>
        {:else}<button class="seg" class:sel={k.i === sel} aria-pressed={k.i === sel} title={`${k.s.label}: bars ${k.s.startBar + 1}–${k.s.startBar + k.s.bars} (starts ${fmtT(k.s.start)})`} style:flex={String(k.flex)} style:background={COLORS[k.s.label]} onclick={() => pick(k.i!, k.s)}>{k.s.label}</button>{/if}
      {/each}
    </div>
    <div class="playhead" style:left={phLeft}></div>
    <div class="barruler" aria-hidden="true" title={G.label} data-grid={G.kind}>
      {#each ticks as t (t.b)}<span style:left={t.left} class={t.ext ? "ext" : ""} data-bar={String(t.b)}>{String(t.b + 1)}</span>{/each}
    </div>
  </div>
  <div class="legend">{#each legend as k (k)}<span><i style:background={COLORS[k]}></i>{k}</span>{/each}</div>

  {#if a.sections[sel]}<SectionDetail index={sel} />{/if}
</section>
