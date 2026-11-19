<!-- The working area: a compact transport, the song map and the editor for the selected section. The map is the central object: each
     band is a section (estimated), the columns inside are the loudness of each bar (measured from the audio). Choosing a band selects
     the section, shows its detail in the editor below and plays it. The transport plays, scrubs, slows down, loops and clicks the
     tracked beats; "Check by ear" (in the editor header) plays the detected parts over the song. On narrow screens only play, time and
     mute stay in the transport and the rest opens on demand. Bar lines, beat clicks and loops use the TimeMap grid (gridOf). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { untrack } from "svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { player } from "../lib/state/player.svelte";
  import { audio } from "../lib/audio/service.svelte";
  import { workspace } from "../lib/state/workspace.svelte";
  import { domain } from "../lib/domain";
  import { gridOf } from "../lib/timeline/grid";
  import { barLoudness } from "../lib/timeline/loudness";
  import { sectionColor, sectionName } from "../lib/timeline/sections";
  import { drums } from "../lib/state/drums.svelte";
  import { PlayerTools, Overlay, BeatClicks } from "../lib/audio/song-tools.svelte";
  import Basis from "../lib/ui/Basis.svelte";
  import Segmented from "../lib/ui/Segmented.svelte";
  import Slider from "../lib/ui/Slider.svelte";
  import Toggle from "../lib/ui/Toggle.svelte";
  import ToggleGroup from "../lib/ui/ToggleGroup.svelte";
  import SectionDetail from "./SectionDetail.svelte";

  const { fmtT, staleReasons } = domain as any;
  const a = $derived(teardown.result as any);
  const stale = $derived((staleReasons(a) as string[]).length > 0);
  const dur = $derived(a.duration || 1);
  const sel = $derived(Math.min(Math.max(teardown.selected, 0), a.sections.length - 1));
  const pct = (t: number) => (100 * Math.max(0, Math.min(dur, t)) / dur).toFixed(3) + "%";

  // bands: the sections, plus the stretches before bar 1 and after the last bar
  type Band = { kind: "seg"; i: number; s: any; from: number; to: number } | { kind: "gap"; from: number; to: number };
  const bands = $derived.by(() => {
    const out: Band[] = []; let tCur = 0;
    const gap = (from: number, to: number) => { if (to - from > 0.05) out.push({ kind: "gap", from, to }); };
    a.sections.forEach((s: any, i: number) => { const st = Math.max(0, s.start), en = Math.min(dur, s.end); if (en <= st) return; gap(tCur, st); out.push({ kind: "seg", i, s, from: st, to: en }); tCur = en; });
    gap(tCur, dur); return out;
  });
  const items = $derived(a.sections.map((s: any, i: number) => ({ value: String(i), label: sectionName(s.label, a), s })));
  const G = $derived(gridOf(a));
  const ticks = $derived.by(() => {
    const every = a.nBars > 96 ? 16 : a.nBars > 40 ? 8 : 4, out: { b: number; left: string; ext: boolean; end: boolean }[] = [];
    for (let b = 0, guard = 0; guard < 4000; b += every, guard++) { let t = G.barStart(b); if (t > dur) break; if (t < -0.05) continue; t = Math.max(0, t); out.push({ b, left: pct(t), ext: G.tracked && G.isExtrapolated(t), end: t / dur > 0.97 }); }
    return out;
  });
  const labels = $derived([...new Set(a.sections.map((s: any) => s.label === "Outro" ? "Intro" : s.label))] as string[]);
  const sectionAt = (t: number) => a.sections.find((s: any) => t >= s.start && t < s.end) ?? null;

  // loudness per bar: measured, only while the audio is on hand
  const loud = $derived.by(() => {
    const buf = teardown.buffer; if (!buf || !teardown.audioURL) return null;
    return barLoudness(buf, G, dur, [a.bpm, a.barSec, a.firstDown, a.duration, a.bpmConf, a.bpmFixed].join("|"));
  });
  const playable = $derived(!!teardown.audioURL);

  let audioEl = $state<HTMLAudioElement | null>(null);
  let tools = $state<PlayerTools | null>(null), now = $state(0), paused = $state(true), scrubbing = false;
  const overlay = new Overlay(), clicks = new BeatClicks();
  $effect(() => {
    const el = audioEl; if (!el) { player.el = null; return; }
    const t = new PlayerTools(untrack(() => teardown.result), el); tools = t;
    player.el = el; player.loopSection = (i, rate) => t.loopSection(i, rate); player.loopRange = (s0, s1, rate) => t.loopRange(s0, s1, rate);
    player.overlayOnly = k => overlay.only(k, teardown.result, el); player.overlayRestart = () => overlay.restart(teardown.result, el);
    const unreg = audio.player(el);
    const move = () => { if (!scrubbing) now = el.currentTime; }; let raf = 0;
    const loopRaf = () => { move(); if (!el.paused) raf = requestAnimationFrame(loopRaf); };
    const onPlay = () => { paused = false; cancelAnimationFrame(raf); loopRaf(); }, onPause = () => { paused = true; move(); };
    el.addEventListener("play", onPlay); el.addEventListener("pause", onPause); el.addEventListener("ended", onPause);
    el.addEventListener("timeupdate", move); el.addEventListener("seeked", move);
    return () => {
      cancelAnimationFrame(raf); el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); el.removeEventListener("ended", onPause);
      el.removeEventListener("timeupdate", move); el.removeEventListener("seeked", move); unreg(); t.destroy(); overlay.stop(); clicks.stop();
      if (player.el === el) { player.el = null; player.loopSection = null; player.loopRange = null; player.overlayOnly = null; player.overlayRestart = null; }
    };
  });
  // a correction replaces the result: the tools keep their loop and speed, and read the new sections and grid
  $effect(() => { const r = teardown.result; if (tools) (tools as any).a = r; });

  const RATES = [{ value: "0.5", label: "50%" }, { value: "0.75", label: "75%" }, { value: "1", label: "100%" }];
  const LOOPS = [{ value: "off", label: "Off" }, { value: "section", label: "Section" }, { value: "here", label: "4 bars" }];
  const ALL_PARTS = [{ value: "drums", label: "Drums" }, { value: "bass", label: "Bass" }, { value: "chords", label: "Chords" }, { value: "hook", label: "Top line" }];
  // no kick or snare found anywhere: no Drums button to play an empty pattern (the notice says so, and can bring it back)
  const PARTS = $derived(drums.hidden ? ALL_PARTS.filter(p => p.value !== "drums") : ALL_PARTS);
  const loopMode = $derived(!tools || tools.loopSel === "" ? "off" : tools.loopSel === "here" ? "here" : "section");
  function setLoop(mode: string) { if (!tools) return; tools.setLoop(mode === "off" ? "" : mode === "here" ? "here" : String(sel)); }
  const parts = $derived(Object.entries(overlay.parts as Record<string, boolean>).filter(([, on]) => on).map(([k]) => k));
  function setParts(v: string[]) { const p = overlay.parts as any; for (const k of Object.keys(p)) p[k] = v.includes(k); }

  function pick(i: number) {
    teardown.selected = i; const s = a.sections[i]; if (!s || !playable) return;
    if (tools && tools.loopSel !== "" && tools.loopSel !== "here") tools.setLoop(String(i)); else player.seek(s.start);
  }
  function togglePlay() { const el = audioEl; if (!el) return; if (el.paused) el.play().catch(() => {}); else el.pause(); }
  function scrub(v: number) { scrubbing = true; now = v; if (audioEl) audioEl.currentTime = Math.min(dur - 0.05, v); }
  const volume = $derived(Math.round(audio.vol.song * 100));

  // hover readout over the map: bar, section, time and the bar's loudness
  let hover = $state<{ x: string; text: string } | null>(null), mapEl: HTMLDivElement;
  function onHover(e: PointerEvent) {
    const r = mapEl.getBoundingClientRect(), t = dur * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), s = sectionAt(t), bar = G.barOf(t);
    const L = loud?.find(l => t >= l.start && t < l.end);
    hover = { x: pct(t), text: [`Bar ${bar + 1}`, s ? sectionName(s.label, a) : "", fmtT(t), L ? `${L.db.toFixed(0).replace("-", "−")} dB` : ""].filter(Boolean).join("  ") };
  }
</script>

{#snippet byear()}
  <div class="byear">
    <Toggle class="cool" pressed={overlay.on} disabled={stale} title={stale ? "The detected parts are out of date after your correction" : "Plays the detected parts over the song. Beeps on the hits mean the detection is right."}
      onchange={on => { if (!audioEl) return; if (on) { overlay.start(a, audioEl); if (audioEl.paused) audioEl.play().catch(() => {}); } else overlay.stop(); }}>Check by ear</Toggle>
    {#if overlay.on}
      <ToggleGroup label="Detected parts to play" items={PARTS} value={parts} onchange={v => { setParts(v); if (audioEl) overlay.restart(a, audioEl); }} />
    {/if}
  </div>
{/snippet}

<div class="explorer" id="explorer">
  <div class="top">
    <h2 id="explore-h" class="sr-only">Arrangement</h2>

    {#if playable}
      <audio src={teardown.audioURL} bind:this={audioEl} preload="auto"></audio>
      <div class="transport playerbar" class:wide={workspace.wide}>
        <div class="primary">
          <button type="button" class="play" aria-label={paused ? "Play" : "Pause"} onclick={togglePlay}>
            {#if paused}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
            {:else}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>{/if}
          </button>
          <span class="clock"><b>{fmtT(now)}</b> / {fmtT(dur)}</span>
          <span class="vol">
            <button type="button" class="iconbtn" id="mute" aria-pressed={audio.vol.muted} aria-label="Mute" onclick={() => audio.toggleMute()}>
              {#if audio.vol.muted}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="m16 9 5 6m0-6-5 6" class="stroke" /></svg>
              {:else}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" class="stroke" /></svg>{/if}
            </button>
            <span id="volume" class="volslider"><Slider label="Volume of the song and of the parts played over it" value={volume} min={0} max={100} step={1} largeStep={10}
              valueText={v => `${v}%`} onchange={v => audio.setAll(v / 100)} /></span>
          </span>
          {#if !workspace.wide}
            <button type="button" class="morebtn" aria-expanded={workspace.more} aria-controls="transport-more" onclick={() => (workspace.more = !workspace.more)}>
              {workspace.more ? "Close" : "Speed, loop"}
            </button>
          {/if}
        </div>
        {#if tools}
          <div class="secondary" id="transport-more" hidden={!workspace.wide && !workspace.more}>
            <div class="tgroup"><span class="tlabel">Speed</span><Segmented label="Speed" items={RATES} value={String(tools.rate)} onchange={v => tools?.setRate(+v)} /></div>
            <div class="tgroup"><span class="tlabel">Loop</span><Segmented label="Loop" items={LOOPS} value={loopMode} onchange={setLoop} /></div>
            <Toggle pressed={clicks.on} disabled={!teardown.buffer} onchange={() => clicks.toggle(a, audioEl, teardown.buffer)}>Beat clicks</Toggle>
          </div>
        {/if}
      </div>
    {/if}

    {#if drums.hidden}
      <p class="small notice info" role="status" data-drumless>No kick or snare was found in this track, so the drum tools are hidden. It may be drumless, or its drums may be too quiet or too washed out to detect. Tempo, beat clicks, the arrangement, chords and notes still apply. <button class="btn" type="button" onclick={() => drums.showAnyway()}>Show the drum tools anyway</button></p>
    {/if}

    <div class="songmap" class:quiet={!loud}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="map" bind:this={mapEl} onpointermove={onHover} onpointerleave={() => (hover = null)}>
        <div class="timeline" data-grid={G.kind}>
          {#each bands as b, bi (bi)}
            {#if b.kind === "gap"}<span class="seggap" style:left={pct(b.from)} style:width={`calc(${pct(b.to)} - ${pct(b.from)})`} title="Before bar 1 / after the last bar"></span>{/if}
          {/each}
          <Segmented class="bands" label="Sections" {items} value={String(sel)} onchange={v => pick(+v)} indicator={false}
            itemProps={(it: any) => ({ class: "seg", title: `${sectionName(it.s.label, a)}: bars ${it.s.startBar + 1}–${it.s.startBar + it.s.bars} (starts ${fmtT(it.s.start)})`,
              style: `left:${pct(Math.max(0, it.s.start))};width:calc(${pct(it.s.end)} - ${pct(Math.max(0, it.s.start))});--c:${sectionColor(it.s.label)}`, "data-label": it.s.label })}>
            {#snippet item(it: any)}<span class="seglabel">{it.label}</span>{/snippet}
          </Segmented>
          {#if loud}
            <svg class="loud" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
              {#each loud as l (l.bar)}
                {@const s = sectionAt((l.start + l.end) / 2)}
                {@const x = 1000 * l.start / dur + 0.6}
                {@const w = Math.max(0.6, 1000 * (l.end - l.start) / dur - 1.2)}
                {@const y = 100 - 100 * l.level}
                <g fill={s ? sectionColor(s.label) : "#5a5f6e"} class:on={!!s && a.sections.indexOf(s) === sel}>
                  <rect class="body" {x} width={w} {y} height={100 * l.level} /><rect class="cap" {x} width={w} {y} height="2.5" />
                </g>
              {/each}
            </svg>
          {/if}
        </div>
        {#if playable}<div class="playhead" style:left={pct(now)} aria-hidden="true"></div>{/if}
        {#if hover}<div class="readout" style:left={hover.x} aria-hidden="true">{hover.text}</div>{/if}
      </div>
      <div class="barruler" aria-hidden="true" title={G.label} data-grid={G.kind}>
        {#each ticks as t (t.b)}<span style:left={t.left} class={[t.ext ? "ext" : "", t.end ? "end" : ""].join(" ").trim()} data-bar={String(t.b)}>{String(t.b + 1)}</span>{/each}
      </div>
      {#if playable}
        <Slider class="scrub" label="Position in the song" value={now} min={0} max={Math.max(0.1, dur)} step={0.1} largeStep={5}
          valueText={v => `${fmtT(v)} of ${fmtT(dur)}`} onchange={scrub} oncommit={() => (scrubbing = false)} />
      {/if}
      <div class="key">
        <span class="keyhead">Sections <Basis kind="estimated" note="Sections are guessed from changes in loudness and tone. Their names (Intro, Build, Drop…) are labels the analyzer gives by rule, not facts about the song." /></span>
        {#each labels as k (k)}<span><i style:background={sectionColor(k)}></i>{k === "Intro" && a.sections.some((s: any) => s.label === "Outro") ? "Intro / Outro" : sectionName(k, a)}</span>{/each}
        {#if !playable}<span class="xnote">Saved teardowns don't keep the audio. Upload the track again to listen.</span>{/if}
        {#if loud}<span class="keyloud"><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="6" width="2" height="5" /><rect x="5" y="3" width="2" height="8" /><rect x="9" y="1" width="2" height="10" /></svg>Loudness per bar <Basis kind="measured" note="RMS level of each bar, computed from the audio you uploaded." /></span>{/if}
      </div>
    </div>
  </div>

  <div class="editor">{#if a.sections[sel]}<SectionDetail index={sel} tools={playable && tools ? byear : undefined} />{/if}</div>
</div>

<style>
  .explorer { display: flex; flex-direction: column; min-height: 0; min-width: 0; flex: 1; gap: 12px; }
  .top { display: grid; gap: 10px; min-width: 0; flex: none; }
  .editor { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
  .keyhead { display: inline-flex; align-items: center; gap: 8px; color: var(--tt-ink-3); }
  .xnote { margin-left: auto; color: var(--tt-ink-3); }

  .songmap { display: grid; gap: 6px; min-width: 0; }
  .map { position: relative; touch-action: pan-y; }
  .timeline {
    position: relative; height: 112px; border-radius: 12px; overflow: hidden; background: var(--tt-inset);
    box-shadow: inset 0 0 0 1px #000, inset 0 1px 0 rgb(255 255 255 / 0.03);
  }
  .quiet .timeline { height: 64px; }
  .seggap { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(45deg, #121318 0 5px, #17181d 5px 10px); }
  .loud { position: absolute; inset: 28px 0 0 0; width: 100%; height: calc(100% - 28px); pointer-events: none; }
  .loud g { opacity: 0.55; transition: opacity var(--tt-ease); }
  .loud g.on { opacity: 1; }
  .loud .body { opacity: 0.42; }

  :global(.explorer .bands) { position: absolute; inset: 0; display: block; }
  :global(.explorer .bands .seg) {
    position: absolute; top: 0; bottom: 0; display: block; padding: 0; border: 0; margin: 0; border-radius: 0; cursor: pointer;
    background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--tt-ink-2); text-align: left; min-width: 0; height: auto; filter: none; text-transform: none; letter-spacing: 0;
    box-shadow: inset 1px 0 0 rgb(0 0 0 / 0.9), inset 0 3px 0 var(--c);
    transition: background-color var(--tt-ease), color var(--tt-ease);
  }
  :global(.explorer .bands .seg:hover) { background: color-mix(in srgb, var(--c) 24%, transparent); color: var(--tt-ink); }
  :global(.explorer .bands .seg[data-checked]) {
    background: color-mix(in srgb, var(--c) 30%, transparent); color: var(--tt-ink);
    box-shadow: inset 0 0 0 2px var(--tt-ink), inset 0 5px 0 var(--c);
  }
  :global(.explorer .bands .seg:focus-visible) { outline: 2px solid var(--tt-focus); outline-offset: -4px; z-index: 1; }
  :global(.explorer .bands .seg .seglabel) {
    position: absolute; top: 9px; left: 8px; right: 6px; font: 600 0.8rem/1.2 var(--tt-font-body); text-transform: none; letter-spacing: 0;
    white-space: nowrap; overflow: hidden; text-overflow: clip;
  }
  :global(.explorer .bands .seg[data-checked] .seglabel) { font-weight: 700; }
  :global(.explorer .bands .seg) { container-type: inline-size; }
  @container (max-width: 64px) { :global(.explorer .bands .seg .seglabel) { display: none; } }

  .playhead { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--tt-lcd); border-radius: 1px; pointer-events: none; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6); }
  .readout {
    position: absolute; top: calc(100% + 2px); translate: -50% 0; padding: 4px 8px; border-radius: 6px; white-space: pre; pointer-events: none;
    background: var(--tt-ink); color: var(--tt-bg); font: 600 0.74rem/1.3 var(--tt-font-body); font-variant-numeric: tabular-nums;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.45); z-index: 2;
  }

  .barruler { position: relative; height: 16px; margin-top: 0; font: 500 0.68rem/16px var(--tt-font-body); font-variant-numeric: tabular-nums; color: var(--tt-ink-3); }

  .barruler :global(span.end) { translate: -100%; border-left: 0; border-right: 1px solid #3a3d46; padding: 0 3px 0 0; }
  .key { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; font-size: var(--tt-fs-xs); color: var(--tt-ink-2); }
  .key i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .keyloud { display: inline-flex; align-items: center; gap: 6px; }
  .keyloud svg { width: 12px; height: 12px; fill: var(--tt-ink-2); }

  :global(.explorer .scrub) { min-width: 0; }
  :global(.explorer .scrub .tt-slider-control) { height: 28px; }

  .transport { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
  .primary { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .secondary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
  .secondary[hidden] { display: none; }
  .tgroup { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .tlabel { font-size: var(--tt-fs-xs); color: var(--tt-ink-3); }
  .play {
    width: 44px; height: 44px; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer; flex: none;
    background: var(--tt-accent); color: var(--tt-accent-ink); transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1), filter var(--tt-ease);
  }
  .play:hover { filter: brightness(1.08); }
  .play:active { transform: scale(0.96); }
  .play:focus-visible, .iconbtn:focus-visible, .morebtn:focus-visible { outline: 2px solid var(--tt-focus); outline-offset: 3px; }
  .play svg { width: 20px; height: 20px; fill: currentColor; }
  .clock { font: 500 0.92rem var(--tt-font-body); font-variant-numeric: tabular-nums; color: var(--tt-ink-3); white-space: nowrap; }
  .clock b { color: var(--tt-ink); font-weight: 600; }
  .vol { display: inline-flex; align-items: center; gap: 2px; }
  .volslider { display: block; width: 88px; }
  .iconbtn { width: var(--tt-tap); height: var(--tt-tap); display: grid; place-items: center; border: 0; border-radius: 10px; background: transparent; color: var(--tt-ink-2); cursor: pointer; }
  .iconbtn:hover { color: var(--tt-ink); background: var(--tt-panel); }
  .iconbtn[aria-pressed="true"] { color: var(--tt-warn); }
  .iconbtn svg { width: 22px; height: 22px; fill: currentColor; }
  .iconbtn svg :global(.stroke) { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
  .morebtn { margin-left: auto; height: var(--tt-tap); padding: 0 14px; border-radius: 10px; border: 1px solid var(--tt-line); background: var(--tt-chassis); color: var(--tt-ink-2); font: 600 .84rem var(--tt-font-body); cursor: pointer; }
  .morebtn[aria-expanded="true"] { color: var(--tt-ink); border-color: #3a3d46; }

  .byear { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

  @media (max-width: 1179px) {
    .explorer { flex: none; }
    .editor { display: block; }
    .top {
      position: sticky; top: 0; z-index: 6; margin: -2px -2px 0; padding: 6px 2px 8px; background: var(--tt-panel);
      border-bottom: 1px solid var(--tt-line); gap: 6px;
    }
    .transport { gap: 0; }
    .primary { width: 100%; gap: 6px; }
    .volslider { display: none; }
    .secondary {
      position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 7; padding: 12px; border-radius: 12px; gap: 12px;
      background: var(--tt-chassis); border: 1px solid var(--tt-line); box-shadow: 0 12px 28px rgb(0 0 0 / 0.5);
    }
    .timeline { height: 84px; } .quiet .timeline { height: 56px; }
    .loud { inset: 24px 0 0 0; height: calc(100% - 24px); }
    :global(.explorer .bands .seg .seglabel) { top: 6px; font-size: 0.74rem; }
    .key { gap: 4px 12px; font-size: .7rem; }
  }
  @media (min-width: 1180px) and (max-height: 820px) {
    .top { gap: 6px; }
    .timeline { height: 84px; } .quiet .timeline { height: 56px; }
    .loud { inset: 22px 0 0 0; height: calc(100% - 22px); }
    :global(.explorer .bands .seg .seglabel) { top: 5px; }
    :global(.explorer .scrub .tt-slider-control) { height: 22px; }
  }
  @media (prefers-reduced-motion: reduce) { .play { transition: none; } }
</style>
