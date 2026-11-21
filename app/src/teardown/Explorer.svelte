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
  import { transport } from "../lib/state/transport.svelte";
  import { createPlayClock } from "../lib/ui/timeline/clock";
  import Playhead from "../lib/ui/timeline/Playhead.svelte";
  import TimeRuler from "../lib/ui/timeline/TimeRuler.svelte";
  import { barBeat } from "../lib/timeline/position";
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
    const every = a.nBars > 96 ? 16 : a.nBars > 40 ? 8 : 4, out: { t: number; label: string; dashed: boolean; end: boolean; attrs: Record<string, string> }[] = [];
    for (let b = 0, guard = 0; guard < 4000; b += every, guard++) { let t = G.barStart(b); if (t > dur) break; if (t < -0.05) continue; t = Math.max(0, t); out.push({ t, label: String(b + 1), dashed: G.tracked && G.isExtrapolated(t), end: t / dur > 0.97, attrs: { "data-bar": String(b) } }); }
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

  let audioEl = $state<HTMLAudioElement | null>(null), attachEl = $state<HTMLInputElement | null>(null);
  let tools = $state<PlayerTools | null>(null), now = $state(0), paused = $state(true);
  const overlay = new Overlay(), clicks = new BeatClicks();
  const view = transport.view;
  // the two viewports follow the track: the overview always shows all of it, the editor starts on about 16 bars from bar 1
  $effect(() => {
    const d = dur, g = G, aa = a;
    // configure() reads and writes the viewport, so none of it may be tracked by this effect (it would re-run itself forever)
    untrack(() => {
      transport.overview.configure(0, d, d); view.configure(0, d, Math.min(4, d));
      const t0 = Math.max(0, g.barStart(0)), t1 = g.barStart(16);
      view.follow = true; view.jump(t0, Math.min(d, (Number.isFinite(t1) ? t1 : t0 + aa.barSec * 16) - t0));
    });
  });
  $effect(() => {
    const el = audioEl; if (!el) { player.el = null; transport.clock = null; return; }
    const t = new PlayerTools(untrack(() => teardown.result), el); tools = t;
    player.el = el; player.loopSection = (i, rate) => t.loopSection(i, rate); player.loopRange = (s0, s1, rate) => t.loopRange(s0, s1, rate);
    player.overlayOnly = k => overlay.only(k, teardown.result, el); player.overlayRestart = () => overlay.restart(teardown.result, el);
    const unreg = audio.player(el);
    // ONE clock: the media element's currentTime, read per animation frame. Follow pages the editor along with it.
    const clock = createPlayClock(el); transport.clock = clock;
    // subscribe() calls back at once: untracked, or this effect would depend on the viewport and rebuild the player on every scroll
    const off = untrack(() => clock.subscribe(tm => {
      now = tm;
      if (view.follow && (tm < view.start || tm > view.end - view.span * 0.06)) view.reveal(tm, 0.06);
    }));
    const onPlay = () => { paused = false; }, onPause = () => { paused = true; };
    paused = el.paused;
    el.addEventListener("play", onPlay); el.addEventListener("pause", onPause); el.addEventListener("ended", onPause);
    return () => {
      off(); clock.destroy(); if (transport.clock === clock) transport.clock = null;
      el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); el.removeEventListener("ended", onPause);
      unreg(); t.destroy(); overlay.stop(); clicks.stop();
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

  // The arrangement is a scrubbing surface. A click seeks to exactly where it lands and selects that section; a drag scrubs (paused stays
  // paused, playing keeps playing from the new place) without changing the selection; a double-click fits that section in the piano roll;
  // the view box's handle pans the piano roll without seeking. The keyboard (the section radios) selects a section and goes to its start.
  const tAt = (e: { clientX: number }) => { const r = mapEl.getBoundingClientRect(); return dur * Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))); };
  const sectionIndexAt = (t: number) => a.sections.findIndex((s: any) => t >= s.start && t < s.end);
  let press: { x: number; t: number; scrub: boolean } | null = null, scrubbing = $state(false);
  function mapDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".vphandle")) return;
    press = { x: e.clientX, t: tAt(e), scrub: false }; mapEl.setPointerCapture(e.pointerId);
  }
  function mapMove(e: PointerEvent) {
    onHover(e); if (!press) return;
    if (!press.scrub) { if (Math.abs(e.clientX - press.x) < 4) return; press.scrub = true; scrubbing = true; }
    const t = tAt(e); if (playable) seekTo(t); else view.reveal(t, 0.5);
  }
  function mapUp(e: PointerEvent) {
    if (!press) return; const p = press; press = null; scrubbing = false;
    try { mapEl.releasePointerCapture(e.pointerId); } catch { /* released */ }
    if (p.scrub) return;
    const i = sectionIndexAt(p.t); if (i >= 0) teardown.selected = i;
    if (!playable) { view.glideTo(p.t, 0.1); return; }
    if (i >= 0 && tools && tools.loopSel !== "" && tools.loopSel !== "here") tools.setLoop(String(i));
    seekTo(p.t); if (!view.contains(p.t)) view.glideTo(p.t, 0.1);
  }
  function fitSection(e: MouseEvent) { const i = sectionIndexAt(tAt(e)), s = a.sections[i]; if (!s) return; view.follow = false; view.glide(Math.max(0, s.start), Math.min(dur, s.end) - Math.max(0, s.start)); }
  function pick(i: number) {
    teardown.selected = i; const s = a.sections[i]; if (!s) return;
    view.glideTo(Math.max(0, s.start), 0.1);
    if (!playable) return;
    if (tools && tools.loopSel !== "" && tools.loopSel !== "here") tools.setLoop(String(i)); else player.seek(Math.max(0, s.start));
  }
  // the view box's handle: drag (or arrow keys) to move what the piano roll shows, without touching playback
  let pan: { x: number; start: number } | null = null, panning = $state(false);
  function hDown(e: PointerEvent) { e.stopPropagation(); pan = { x: e.clientX, start: view.start }; panning = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function hMove(e: PointerEvent) { if (!pan) return; const w = Math.max(1, mapEl.getBoundingClientRect().width); view.follow = false; view.jump(pan.start + ((e.clientX - pan.x) / w) * dur); }
  function hUp() { pan = null; panning = false; }
  function hKey(e: KeyboardEvent) {
    const step = view.span * (e.shiftKey ? 1 : 0.25);
    if (e.key === "ArrowRight") view.pan(step); else if (e.key === "ArrowLeft") view.pan(-step); else if (e.key === "Home") { view.follow = false; view.jump(0); } else if (e.key === "End") { view.follow = false; view.jump(dur); } else return;
    e.preventDefault();
  }
  // the section the playhead is in (playing), shown apart from the selected one
  const playingIdx = $derived(playable && transport.clock ? sectionIndexAt(now) : -1);
  function togglePlay() { const el = audioEl; if (!el) return; if (el.paused) el.play().catch(() => {}); else el.pause(); }
  function stop() { const el = audioEl; if (!el) return; el.pause(); el.currentTime = 0; view.follow = true; view.reveal(Math.max(0, G.barStart(0)), 0.05); }
  function seekTo(t: number) { const el = audioEl; if (!el) return; el.currentTime = Math.min(Math.max(0, t), dur - 0.05); if (view.follow) view.reveal(el.currentTime, 0.06); }
  // Space plays and pauses, except where it already does something (typing, a button, a menu, a dialog).
  function onKey(e: KeyboardEvent) {
    if (e.key !== " " || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !audioEl) return;
    const t = e.target as HTMLElement | null; if (!t) return;
    if (t.closest("input[type=text], input[type=number], textarea, select, [contenteditable], [role=dialog], [role=menu], summary, a")) return;
    if (t.closest("button, [role=tab], [role=radio], [role=switch], input[type=checkbox]") && !t.closest(".map, .lanes")) return;
    e.preventDefault(); togglePlay();
  }
  const pos = $derived(barBeat(G, a, now));
  const volume = $derived(Math.round(audio.vol.song * 100));

  // hover readout over the map: bar, section, time and the bar's loudness
  let hover = $state<{ x: string; text: string } | null>(null), mapEl: HTMLDivElement;
  function onHover(e: PointerEvent) {
    const r = mapEl.getBoundingClientRect(), t = dur * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), s = sectionAt(t), bar = G.barOf(t);
    const L = loud?.find(l => t >= l.start && t < l.end);
    hover = { x: pct(t), text: [`Bar ${bar + 1}`, s ? sectionName(s.label, a) : "", fmtT(t), L ? `${L.db.toFixed(0).replace("-", "−")} dB` : ""].filter(Boolean).join("  ") };
  }
</script>

<svelte:document onkeydown={onKey} />

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
          <button type="button" class="play" class:on={!paused} aria-label={paused ? "Play" : "Pause"} onclick={togglePlay}>
            {#if paused}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
            {:else}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>{/if}
          </button>
          <button type="button" class="iconbtn stop" aria-label="Stop (back to the start)" title="Stop: back to the start" onclick={stop}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" /></svg></button>
          <!-- two readouts, each its own unit: a small label over a figure. Time is where you are of how long; Bar is bar.beat on the tracked grid -->
          <span class="ro clock" title="Time: where you are, of the track's length"><span class="rlabel plabel">Time</span><span class="rfig"><b>{fmtT(now)}</b><span class="total">/ {fmtT(dur)}</span></span></span>
          <span class="ro posn" title="Bar and beat, from the tracked beats"><span class="rlabel plabel">Bar · beat</span><span class="rfig"><b>{#if pos}{pos.bar}<span class="beat">.{Math.floor(pos.beat)}</span>{:else}–{/if}</b></span></span>
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
              {workspace.more ? "Close" : "More"}
            </button>
          {/if}
        </div>
        {#if tools}
          <div class="secondary" id="transport-more" hidden={!workspace.wide && !workspace.more}>
            <div class="tgroup"><span class="tlabel" aria-hidden="true">Speed</span><Segmented label="Speed" items={RATES} value={String(tools.rate)} onchange={v => tools?.setRate(+v)} /></div>
            <div class="tgroup"><span class="tlabel" aria-hidden="true">Loop</span><Segmented label="Loop" items={LOOPS} value={loopMode} onchange={setLoop} /></div>
            <Toggle pressed={clicks.on} disabled={!teardown.buffer} onchange={() => clicks.toggle(a, audioEl, teardown.buffer)}>Beat clicks</Toggle>
            <Toggle pressed={view.follow} title="The editor pages along with playback. Scrolling or zooming it yourself turns this off; Stop or this button turns it back on."
              onchange={on => { view.follow = on; if (on) view.reveal(now, 0.06); }}>Follow</Toggle>
          </div>
        {/if}
      </div>
    {/if}

    {#if drums.hidden}
      <p class="small notice info" role="status" data-drumless>{#if drums.measured}No drums found in this track, so there is no drum analysis and the drum tools are hidden. Almost none of the sound is percussive, as in a solo piano piece; a very quiet or washed-out drum part could read the same way. Vocals are not detected. {:else}No kick or snare was found in this track, so the drum tools are hidden. It may be drumless, or its drums may be too quiet or too washed out to detect. {/if}<button class="btn" type="button" onclick={() => drums.showAnyway()}>Show the drum tools anyway</button></p>
    {/if}

    {#if !playable}
      <div class="attach">
        <input type="file" id="attach" class="sr-only" tabindex="-1" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac" bind:this={attachEl}
          onchange={e => { const f = e.currentTarget.files?.[0]; void teardown.attachAudio(f); e.currentTarget.value = ""; }}>
        <button type="button" class="btn primary" id="attach-btn" onclick={() => attachEl?.click()}>Attach audio</button>
        <span class="small" id="no-audio">Playback is unavailable: a saved teardown doesn't keep the audio. Attach the track it was made from to play it. It stays in this browser.</span>
      </div>
    {/if}

    <div class="songmap" class:quiet={!loud}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="map" class:scrubbing bind:this={mapEl} onpointerdown={mapDown} onpointermove={mapMove} onpointerup={mapUp} onpointercancel={mapUp} onpointerleave={() => (hover = null)} ondblclick={fitSection}
        title="Click to play from there and select the section; drag to scrub; double-click to fit a section in the piano roll">
        <div class="timeline" data-grid={G.kind}>
          {#each bands as b, bi (bi)}
            {#if b.kind === "gap"}<span class="seggap" style:left={pct(b.from)} style:width={`calc(${pct(b.to)} - ${pct(b.from)})`} title="Before bar 1 / after the last bar"></span>{/if}
          {/each}
          <Segmented class="bands" label="Sections" {items} value={String(sel)} onchange={v => pick(+v)} indicator={false}
            itemProps={(it: any) => ({ class: "seg", title: `${sectionName(it.s.label, a)}: bars ${it.s.startBar + 1}–${it.s.startBar + it.s.bars} (starts ${fmtT(it.s.start)})`,
              style: `left:${pct(Math.max(0, it.s.start))};width:calc(${pct(it.s.end)} - ${pct(Math.max(0, it.s.start))});--c:${sectionColor(it.s.label)}`, "data-label": it.s.label,
              "data-playing": +it.value === playingIdx ? "" : undefined })}>
            {#snippet item(it: any)}<span class="seglabel">{#if +it.value === playingIdx}<span class="nowmark" aria-label="playing">▶ </span>{/if}{it.label}</span>{/snippet}
          </Segmented>
          {#if loud}
            <svg class="loud" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
              {#each loud as l (l.bar)}
                {@const s = sectionAt((l.start + l.end) / 2)}
                {@const x = 1000 * l.start / dur + 0.6}
                {@const w = Math.max(0.6, 1000 * (l.end - l.start) / dur - 1.2)}
                {@const y = 100 - 100 * l.level}
                <g fill={s ? sectionColor(s.label) : "#A9B1A8"} class:on={!!s && a.sections.indexOf(s) === sel}>
                  <rect class="body" {x} width={w} {y} height={100 * l.level} /><rect class="cap" {x} width={w} {y} height="2.5" />
                </g>
              {/each}
            </svg>
          {/if}
        </div>
        {#if view.span < dur - 0.05}
          <div class="vpwin" class:panning style:left={pct(view.start)} style:width={`calc(${pct(view.end)} - ${pct(view.start)})`} data-viewport>
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div class="vphandle" role="slider" tabindex="0" aria-label="What the piano roll shows (drag, or use the arrow keys)" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(view.start)} aria-valuetext={`From ${fmtT(view.start)} to ${fmtT(view.end)}`}
              title="Drag to move what the piano roll shows (playback stays where it is)" onpointerdown={hDown} onpointermove={hMove} onpointerup={hUp} onpointercancel={hUp} onkeydown={hKey} ondblclick={e => e.stopPropagation()}><i></i></div>
          </div>
        {/if}
        {#if playable}<Playhead clock={transport.clock} viewport={transport.overview} label="arrangement" />{/if}
        {#if hover}<div class="readout" style:left={hover.x} aria-hidden="true">{hover.text}</div>{/if}
      </div>
      <TimeRuler class="barruler" viewport={transport.overview} {ticks} height={18} title={G.label} attrs={{ "data-grid": G.kind }} onseek={playable ? (t => { seekTo(t); }) : undefined}
        slider={{ label: "Position in the song", value: now, max: dur, text: `${fmtT(now)} of ${fmtT(dur)}` }} />
      <div class="key">
        <span class="keyhead">Sections <Basis kind="estimated" note="Sections are guessed from changes in loudness and tone. Their names (Intro, Build, Drop…) are labels the analyzer gives by rule, not facts about the song." /></span>
        {#each labels as k (k)}<span><i style:background={sectionColor(k)}></i>{k === "Intro" && a.sections.some((s: any) => s.label === "Outro") ? "Intro / Outro" : sectionName(k, a)}</span>{/each}
        {#if loud}<span class="keyloud"><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="6" width="2" height="5" /><rect x="5" y="3" width="2" height="8" /><rect x="9" y="1" width="2" height="10" /></svg>Loudness per bar <Basis kind="measured" note="RMS level of each bar, computed from the audio you uploaded." /></span>{/if}
      </div>
    </div>
  </div>

  <div class="editor">{#if a.sections[sel]}<SectionDetail index={sel} tools={playable && tools ? byear : undefined} />{/if}</div>
</div>

<style>
  .explorer { display: flex; flex-direction: column; min-height: 0; min-width: 0; flex: 1; gap: 12px; }
  .top { display: grid; gap: 8px; min-width: 0; flex: none; }
  .editor { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
  .keyhead { display: inline-flex; align-items: center; gap: 8px; color: var(--tt-ink-3); }

  .songmap { display: grid; gap: 6px; min-width: 0; }
  .map { position: relative; touch-action: pan-y; }
  .timeline {
    position: relative; height: 112px; border-radius: 0; overflow: hidden; background: var(--tt-panel);
    box-shadow: inset 0 0 0 1px var(--tt-line-2);
  }
  .quiet .timeline { height: 64px; }
  .seggap { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(45deg, var(--tt-inset) 0 5px, var(--tt-step-off) 5px 10px); }
  .loud { position: absolute; inset: 28px 0 0 0; width: 100%; height: calc(100% - 28px); pointer-events: none; }
  .loud g { opacity: 0.55; transition: opacity var(--tt-ease); }
  .loud g.on { opacity: 1; }
  .loud .body { opacity: 0.42; }

  :global(.explorer .bands) { position: absolute; inset: 0; display: block; }
  :global(.explorer .bands .seg) {
    position: absolute; top: 0; bottom: 0; display: block; padding: 0; border: 0; margin: 0; border-radius: 0; cursor: pointer;
    background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--tt-ink-2); text-align: left; min-width: 0; height: auto; filter: none; text-transform: none; letter-spacing: 0;
    box-shadow: inset 1px 0 0 var(--tt-line-2), inset 0 3px 0 var(--c);
    transition: background-color var(--tt-ease), color var(--tt-ease);
  }
  :global(.explorer .bands .seg:hover) { background: color-mix(in srgb, var(--c) 24%, transparent); color: var(--tt-ink); }
  /* the selected section: a deeper tint and a thicker colour bar, no outline (the view box is the one outline on the map) */
  :global(.explorer .bands .seg[data-checked]) {
    background: color-mix(in srgb, var(--c) 34%, transparent); color: var(--tt-ink);
    box-shadow: inset 1px 0 0 var(--tt-line-2), inset 0 5px 0 var(--c);
  }
  :global(.explorer .bands .seg:focus-visible) { outline: 2px solid var(--tt-focus); outline-offset: -4px; z-index: 1; }
  :global(.explorer .bands .seg .seglabel) {
    position: absolute; top: 9px; left: 8px; right: 6px; font: 500 0.8rem/1.2 var(--tt-font-body); text-transform: none; letter-spacing: 0;
    white-space: nowrap; overflow: hidden; text-overflow: clip;
  }
  :global(.explorer .bands .seg[data-checked] .seglabel) { font-weight: 600; }
  :global(.explorer .bands .seg) { container-type: inline-size; }
  @container (max-width: 64px) { :global(.explorer .bands .seg .seglabel) { display: none; } }

  .map { --tl-playhead: var(--tt-lcd); }
  .vpwin { position: absolute; top: 0; bottom: 0; border: 1px solid var(--tt-accent); background: color-mix(in srgb, var(--tt-accent) 6%, transparent); border-radius: 0; pointer-events: none; z-index: 3; transition: left 120ms cubic-bezier(0.23, 1, 0.32, 1), width 120ms cubic-bezier(0.23, 1, 0.32, 1); }
  .vpwin.panning { transition: none; }
  /* the grip is the window's bottom edge: a slim cobalt strip (with a taller invisible hit area) that thickens under the pointer */
  .vphandle { position: absolute; left: -1px; right: -1px; bottom: -1px; height: 14px; pointer-events: auto; cursor: ew-resize; touch-action: none; }
  .vphandle i { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--tt-accent); transition: height 120ms ease; }
  .vphandle:hover i, .vpwin.panning .vphandle i { height: 5px; }
  .vphandle:focus-visible { outline: 2px solid var(--tt-focus); outline-offset: 2px; }
  .map { cursor: pointer; }
  .map.scrubbing, .map.scrubbing :global(.seg) { cursor: ew-resize; }
  :global(.explorer .bands .seg[data-playing]) { box-shadow: inset 1px 0 0 var(--tt-line-2), inset 0 3px 0 var(--c), inset 0 -4px 0 var(--tt-lcd); }
  :global(.explorer .bands .seg[data-playing][data-checked]) { box-shadow: inset 1px 0 0 var(--tt-line-2), inset 0 5px 0 var(--c), inset 0 -4px 0 var(--tt-lcd); }
  :global(.explorer .bands .seg .nowmark) { color: var(--tt-lcd); }
  /* readouts: a small label over a monospaced figure, a hairline between them, so time and bar never read as one run of text */
  .ro { display: inline-grid; grid-template-rows: auto auto; align-content: center; gap: 1px; padding: 0 12px; white-space: nowrap; line-height: 1; }
  .ro + .ro { border-left: 1px solid var(--tt-line-2); }
  .rlabel { font: 500 .62rem/1 var(--tt-font-body); letter-spacing: .06em; text-transform: uppercase; color: var(--tt-ink-3); }
  .rfig { font: 500 .95rem/1.1 var(--tt-font-mono); font-variant-numeric: tabular-nums; color: var(--tt-ink-3); letter-spacing: -0.01em; }
  .rfig b { color: var(--tt-ink); font-weight: 600; }
  .clock .total { margin-left: 0.5ch; }
  .posn .beat { color: var(--tt-ink-3); font-weight: 500; }
  .posn .rfig { min-width: 6ch; }
  .attach { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
  .readout {
    position: absolute; top: calc(100% + 2px); translate: -50% 0; padding: 4px 8px; border-radius: 0; white-space: pre; pointer-events: none;
    background: var(--tt-ink); color: var(--tt-bg); font: 600 0.74rem/1.3 var(--tt-font-body); font-variant-numeric: tabular-nums;
    box-shadow: var(--tt-shadow); z-index: 2;
  }

  /* The bar ruler is a TimeRuler: styled by its own component and by .barruler in components.css (scoped rules here cannot reach it). */
  .key { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; font-size: var(--tt-fs-xs); color: var(--tt-ink-2); }
  .key i { display: inline-block; width: 10px; height: 10px; border-radius: 0; margin-right: 6px; vertical-align: -1px; }
  .keyloud { display: inline-flex; align-items: center; gap: 6px; }
  .keyloud svg { width: 12px; height: 12px; fill: var(--tt-ink-2); }


  .transport { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
  .primary { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .secondary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
  .secondary[hidden] { display: none; }
  .tgroup { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .tlabel { font-size: var(--tt-fs-xs); color: var(--tt-ink-3); }
  /* wide: ONE compact row (play, time, bar, volume, speed, loop, beat clicks, follow), so the piano roll gets the height */
  .transport.wide { flex-wrap: nowrap; gap: 12px; }
  .transport.wide .secondary { flex-wrap: nowrap; gap: 8px; margin-left: auto; }
  .transport.wide .primary { gap: 4px; }
  .transport.wide .tlabel { display: none; }
  .transport.wide .volslider { width: 72px; }
  .transport.wide .play { width: 34px; height: 34px; } .transport.wide .play svg { width: 16px; height: 16px; }
  .transport.wide .iconbtn { width: 32px; height: 32px; } .transport.wide .iconbtn svg { width: 19px; height: 19px; }
  .transport.wide :global(.tt-seg .tt-seg-item) { height: 28px; min-width: 36px; padding: 0 8px; font-size: .78rem; }
  .transport.wide :global(.tt-toggle) { height: 30px; padding: 0 10px; font-size: .8rem; }
  .transport.wide :global(.tt-slider .tt-slider-control) { height: 32px; }
  .play {
    width: 44px; height: 44px; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer; flex: none;
    background: var(--tt-accent); color: var(--tt-accent-ink); transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1), filter var(--tt-ease);
  }
  .play:hover { filter: brightness(1.08); }
  /* while it plays, a fine ring breathes around the button: the one bit of motion during playback, and it never moves anything you use */
  .play { position: relative; }
  .play::after { content: ""; position: absolute; inset: -5px; border-radius: 50%; border: 1px solid var(--tt-accent); opacity: 0; pointer-events: none; }
  .play.on::after { animation: tt-breathe 2.4s ease-in-out infinite; }
  @keyframes tt-breathe { 0%, 100% { opacity: .15; transform: scale(1); } 50% { opacity: .55; transform: scale(1.08); } }
  @media (prefers-reduced-motion: reduce) { .play.on::after { animation: none; opacity: .4; } }
  .play:active { transform: scale(0.96); }
  .play:focus-visible, .iconbtn:focus-visible, .morebtn:focus-visible { outline: 2px solid var(--tt-focus); outline-offset: 3px; }
  .play svg { width: 20px; height: 20px; fill: currentColor; }

  .vol { display: inline-flex; align-items: center; gap: 2px; }
  .volslider { display: block; width: 88px; }
  .iconbtn { width: var(--tt-tap); height: var(--tt-tap); display: grid; place-items: center; border: 0; border-radius: 2px; background: transparent; color: var(--tt-ink-2); cursor: pointer; }
  .iconbtn:hover { color: var(--tt-ink); background: var(--tt-panel); }
  .iconbtn[aria-pressed="true"] { color: var(--tt-accent); }
  .iconbtn svg { width: 22px; height: 22px; fill: currentColor; }
  .iconbtn svg :global(.stroke) { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
  .morebtn { margin-left: auto; height: var(--tt-tap); padding: 0 12px; border-radius: 2px; border: 1px solid var(--tt-line-2); background: var(--tt-panel); color: var(--tt-ink-2); font: 600 .84rem var(--tt-font-body); cursor: pointer; }
  .morebtn[aria-expanded="true"] { color: var(--tt-ink); border-color: var(--tt-ink); }

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
      position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 7; padding: 12px; border-radius: 0; gap: 12px;
      background: var(--tt-chassis); border: 1px solid var(--tt-ink); box-shadow: var(--tt-shadow);
    }
    .timeline { height: 84px; } .quiet .timeline { height: 56px; }
    .loud { inset: 24px 0 0 0; height: calc(100% - 24px); }
    :global(.explorer .bands .seg .seglabel) { top: 6px; font-size: 0.74rem; }
    .key { gap: 4px 12px; font-size: .7rem; }
  }
  @media (max-width: 480px) {
    .clock .total { display: none; }
    .ro { padding: 0 8px; }
  }
  @media (min-width: 1180px) and (max-height: 820px) {
    .top { gap: 6px; }
    .timeline { height: 84px; } .quiet .timeline { height: 56px; }
    .loud { inset: 22px 0 0 0; height: calc(100% - 22px); }
    :global(.explorer .bands .seg .seglabel) { top: 5px; }
  }
  @media (prefers-reduced-motion: reduce) { .play { transition: none; } }
</style>
