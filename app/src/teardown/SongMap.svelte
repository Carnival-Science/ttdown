<!-- Song map: player, listening tools, arrangement timeline with the bar ruler, section table (legacy render() "player + arrangement").
     Bar lines, metronome clicks and "loop 4 bars from where I am" use the TimeMap grid (gridOf), as in the legacy page. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { untrack } from "svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { player } from "../lib/state/player.svelte";
  import { audio } from "../lib/audio/service.svelte";
  import { domain } from "../lib/domain";
  import { gridOf } from "../lib/timeline/grid";
  import { PlayerTools, Overlay, BeatClicks } from "../lib/audio/song-tools.svelte";
  import { helpText } from "../lib/ui/fold";

  const { COLORS, SECTION_HOW, fmtT } = domain as any;
  const a = $derived(teardown.result);
  const ex = $derived(teardown.example);
  const dur = $derived(a.duration || 1);
  // timeline blocks in seconds, so they line up with the playhead and the audio
  const blocks = $derived.by(() => {
    const out: { kind: "seg" | "gap"; flex: number; s?: any }[] = []; let tCur = 0;
    const gap = (from: number, to: number) => { if (to - from > 0.05) out.push({ kind: "gap", flex: +(to - from).toFixed(3) }); };
    a.sections.forEach(s => { const st = Math.max(0, s.start), en = Math.min(dur, s.end); if (en <= st) return; gap(tCur, st); out.push({ kind: "seg", flex: +(en - st).toFixed(3), s }); tCur = en; });
    gap(tCur, dur); return out;
  });
  const G = $derived(gridOf(a));
  const ticks = $derived.by(() => {
    const every = a.nBars > 96 ? 16 : a.nBars > 40 ? 8 : 4, out: { b: number; left: string; ext: boolean }[] = [];
    for (let b = 0, guard = 0; guard < 4000; b += every, guard++) { let t = G.barStart(b); if (t > dur) break; if (t < -0.05) continue; t = Math.max(0, t); out.push({ b, left: (100 * t / dur).toFixed(3) + "%", ext: G.tracked && G.isExtrapolated(t) }); }
    return out;
  });
  const legend = $derived(Object.keys(COLORS).filter((k, i, arr) => arr.indexOf(k) === i && k !== "Outro"));
  const showPlayer = $derived(!ex && !!teardown.audioURL);

  // player, tools and playhead
  let audioEl = $state<HTMLAudioElement | null>(null), tl: HTMLDivElement, phLeft = $state("0%");
  let tools = $state<PlayerTools | null>(null);
  const overlay = new Overlay(), clicks = new BeatClicks();
  $effect(() => {
    const el = audioEl; if (!el) { player.el = null; return; }
    const r = untrack(() => teardown.result); const t = new PlayerTools(r, el); tools = t;
    player.el = el; player.loopSection = (i, rate) => t.loopSection(i, rate); player.loopRange = (s0, s1, rate) => t.loopRange(s0, s1, rate);
    player.overlayOnly = k => overlay.only(k, teardown.result, el); player.overlayRestart = () => overlay.restart(teardown.result, el);
    const unreg = audio.player(el);
    const move = () => { phLeft = (100 * el.currentTime / ((t as any).a.duration || 1)) + "%"; }; let raf = 0;
    const loopRaf = () => { move(); if (!el.paused) raf = requestAnimationFrame(loopRaf); };
    const onPlay = () => { cancelAnimationFrame(raf); loopRaf(); };
    el.addEventListener("play", onPlay); el.addEventListener("timeupdate", move); el.addEventListener("seeked", move);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("play", onPlay); el.removeEventListener("timeupdate", move); el.removeEventListener("seeked", move); unreg(); t.destroy(); overlay.stop(); clicks.stop(); if (player.el === el) { player.el = null; player.loopSection = null; player.loopRange = null; player.overlayOnly = null; player.overlayRestart = null; } };
  });
  // corrections replace the result: the tools keep their loop and speed, and read the new sections and grid
  $effect(() => { const r = teardown.result; if (tools) (tools as any).a = r; });
  const RATES = [0.5, 0.75, 1];
  const OVERLAY_PARTS: [string, string][] = [["drums", "Drums"], ["bass", "808 / bass"], ["chords", "Chords"], ["hook", "Hook"]];
  const SOLO: [string, number, number][] = [["Full mix", 0, 0], ["Kick + bass", 0, 180], ["Mids", 250, 2500], ["Highs", 5000, 0]];
  function seekTo(e: MouseEvent) { if ((e.target as Element).closest(".seg") || !audioEl) return; const r = tl.getBoundingClientRect(); audioEl.currentTime = Math.max(0, Math.min(dur - 0.05, dur * (e.clientX - r.left) / r.width)); }
  let songVol = $state(Math.round(audio.vol.song * 100));
</script>

<section class="panel" data-group="map">
  <h2>Arrangement map</h2>
  <p class="small">{"Copy this layout into your FL Studio Playlist. Each block is in bars. " + (showPlayer ? "Click a block to jump there." : "")}</p>
  {#if a.steady}<p class="tip">This song keeps one groove the whole way: the loudness and tone barely change, so there's no big drop to map. The changes are in the details, like filters, vocal chops and parts coming in and out. Listen for those and copy them as small 4- or 8-bar variations.</p>{/if}
  {#if showPlayer}
    <audio controls src={teardown.audioURL} bind:this={audioEl}></audio>
    {#if tools}
      <div class="ptools">
        <div class="row" style="gap:8px">
          <span class="small">Speed</span>
          <span class="seg2">{#each RATES as r (r)}<button type="button" aria-pressed={(tools.rate === r)} onclick={() => tools?.setRate(r)}>{r * 100 + "%"}</button>{/each}</span>
          <select class="isel" aria-label="Loop part of the song" value={tools.loopSel} onchange={e => tools?.setLoop(e.currentTarget.value)}>
            <option value="">Loop: off</option>
            {#each a.sections as s, i (i)}<option value={String(i)}>{`Loop ${s.label} (bars ${s.startBar + 1}–${s.startBar + s.bars})`}</option>{/each}
            <option value="here">Loop 4 bars from where I am</option>
          </select>
        </div>
        <div class="row" style="gap:8px"><span class="small">Listen to</span><span class="seg2">{#each SOLO as [n], i (n)}<button type="button" aria-pressed={(tools.solo === i)} onclick={() => tools?.setSolo(i, SOLO)}>{n}</button>{/each}</span></div>
        <p class="why" {@attach helpText()}>To copy a part by ear: loop 4 bars at 50% speed. "Kick + bass" hides everything above 180 Hz so you hear the low end on its own; "Highs" leaves just hats and air.</p>
      </div>
      <div class="ptools">
        <div class="row" style="gap:8px">
          <button class="btn cool" type="button" onclick={() => audioEl && overlay.start(a, audioEl)}>{overlay.on ? "■ Stop checking" : "▶ Check by ear"}</button>
          <span class="small">Play over the song:</span>
          <span class="seg2">{#each OVERLAY_PARTS as [k, label] (k)}<button type="button" aria-pressed={!!(overlay.parts as any)[k]} onclick={() => { const p = overlay.parts as any; p[k] = !p[k]; }}>{label}</button>{/each}</span>
          <span class="small">Song volume</span>
          <input type="range" min="0" max="100" aria-label="Song volume while checking" style="width:110px;accent-color:var(--accent)" bind:value={songVol} oninput={() => audio.setSong(songVol / 100)}>
        </div>
        <p class="why" {@attach helpText()}>This plays the notes the app detected on top of the real song, in time. If the beeps land on the song's hits, the result is right. If a kick or snare lands between hits, fix that square in the Drum pattern section. If the 808 beeps clash, the bass notes are off. Tip: use 75% speed and loop a section while you check.</p>
      </div>
      {#if teardown.buffer}
        <div class="row"><button class="btn cool" bind:this={player.beatClicks} onclick={() => clicks.toggle(a, audioEl, teardown.buffer)}>{clicks.on ? "■ Stop" : "▶ Play with beat clicks"}</button><span class="small">Plays the song with a click on every detected beat (louder on beat 1). If the clicks drift or land between hits, fix the BPM above.</span></div>
      {/if}
    {/if}
  {/if}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="playhead-wrap" onclick={seekTo}>
    <div class="timeline" role="group" aria-label="Arrangement" bind:this={tl}>
      {#each blocks as k, i (i)}
        {#if k.kind === "gap"}<span class="seggap" style:flex={String(k.flex)} title="Before bar 1 / after the last bar"></span>
        {:else}<button class="seg" title={`${k.s.label}: bars ${k.s.startBar + 1}–${k.s.startBar + k.s.bars} (starts ${fmtT(k.s.start)})`} style:flex={String(k.flex)} style:background={COLORS[k.s.label]} onclick={() => player.seek(k.s.start)}>{k.s.label}</button>{/if}
      {/each}
    </div>
    <div class="playhead" style:left={phLeft}></div>
    <div class="barruler" aria-hidden="true" title={G.label} data-grid={G.kind}>
      {#each ticks as t (t.b)}<span style:left={t.left} class={t.ext ? "ext" : ""} data-bar={String(t.b)}>{String(t.b + 1)}</span>{/each}
    </div>
  </div>
  <div class="legend">{#each legend as k (k)}<span><i style:background={COLORS[k]}></i>{k}</span>{/each}</div>
  <div class="scroll"><table>
    <thead><tr>{#each ["Section", "Bars", "Length", "Starts", "How to build it"] as h (h)}<th>{h}</th>{/each}</tr></thead>
    <tbody>{#each a.sections as s, i (i)}<tr><td><b>{s.label}</b></td><td class="num">{`${s.startBar + 1}–${s.startBar + s.bars}`}</td><td class="num">{String(s.bars)}</td><td class="num">{fmtT(s.start)}</td><td>{SECTION_HOW[s.label]}</td></tr>{/each}</tbody>
  </table></div>
</section>
