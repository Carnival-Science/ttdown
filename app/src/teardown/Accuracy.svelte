<!-- Overview: "Check the results first" checklist and stem uploads (legacy accuracyPanel + stemPanel). -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import { player, nav } from "../lib/state/player.svelte";
  import { domain } from "../lib/domain";
  import { engine, type AnalysisResult } from "../lib/engine";
  import { bumpIdeas } from "../lib/state/ideas.svelte";

  const { loudestIdx, IDEAS } = domain;
  const a = $derived(teardown.result);
  const checks = $derived((a.checks || {}) as Record<string, boolean>);
  const di = $derived(loudestIdx(a)), d = $derived(a.sections[di]!);
  const items = $derived([
    { k: "bpm", title: "Tempo is right", how: `Play the song with beat clicks. The clicks should land on the kicks and never drift. If they don't, fix the BPM in the box at the top (×2, ÷2, tap, or type it).`, btn: "Open beat clicks", go: () => nav.goMap(() => player.beatClicks?.scrollIntoView({ behavior: "smooth", block: "center" })) },
    { k: "key", title: "Key is right", how: `Play the song, then press ▶ next to each key option at the top. Keep the one that sounds settled. Tap Use if it's a different one.`, btn: "Go to the key check", go: () => { nav.show("overview"); setTimeout(() => document.querySelector(".keycheck")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120); } },
    { k: "drums", title: "Drums land on the song's hits", how: `Loops the ${d.label} (bars ${d.startBar + 1}–${d.startBar + d.bars}) at 75% speed with only the detected drums playing on top. Where a beep lands between hits, click that square in the Drum pattern to fix it.`, btn: `Loop the ${d.label} at 75% with drums`, go: () => nav.goMap(() => { player.loopSection?.(di, 0.75); player.overlayOnly?.("drums"); }) },
    { k: "bass", title: "808 / bass notes sit in tune", how: `Same loop, now with only the detected 808 notes. If they clash with the song's bass, upload a bass stem below, or fix the notes in the Piano roll after importing.`, btn: `Loop the ${d.label} at 75% with 808`, go: () => nav.goMap(() => { player.loopSection?.(di, 0.75); player.overlayOnly?.("bass"); }) },
  ]);
  const n = $derived(items.filter(i => checks[i.k]).length);
  const setCheck = (k: string, v: boolean) => teardown.replace(x => { x.checks = { ...(x.checks as object || {}), [k]: v }; });

  // ---- stems (legacy stemPanel): analyse a stem of this song and put its results on the song's own grid
  const KINDS = [
    ["drums", "Drum stem", "replaces the drum pattern, the drum changes and the swing"],
    ["bass", "Bass / 808 stem", "replaces the 808 / bass notes"],
    ["music", "Melody / instruments stem", "replaces the chords and the hook (use the stem without drums, bass or vocals)"],
  ] as const;
  let note = $state("");
  const stems = $derived((a.stems || {}) as Record<string, string>);
  const inputs: Record<string, HTMLInputElement> = {};
  /* eslint-disable @typescript-eslint/no-explicit-any */
  async function useStem(k: string, label: string, f: File | undefined) {
    if (!f) return;
    note = `Analyzing the ${label.toLowerCase()}…`;
    try {
      const s2: any = await engine.analyze(f, pc => { note = `Analyzing the ${label.toLowerCase()}… ${pc}%`; }, true);
      const cur = teardown.result;
      const off = Math.abs(s2.bpm - cur.bpm) / cur.bpm, half = Math.abs(s2.bpm * 2 - cur.bpm) / cur.bpm < 0.03 || Math.abs(s2.bpm / 2 - cur.bpm) / cur.bpm < 0.03;
      if (off > 0.03 && !half) { note = `That stem came out at ${s2.bpm} BPM but the song is ${cur.bpm}. Make sure it's a stem from this same song, the same length, then try again.`; return; }
      teardown.replace((x: AnalysisResult) => {
        const a2: any = x;
        const stepS = a2.barSec / 16, dSteps = ((s2.firstDown || 0) - (a2.firstDown || 0)) / stepS, dRound = Math.round(dSteps);
        const rot = (arr: any[]) => { if (!arr) return arr; const o = new Array(16); arr.forEach((v, j) => { o[(((j + dRound) % 16) + 16) % 16] = v; }); return o; };
        const rotPat = (P: any) => { const o: any = { kick: rot(P.kick), snare: rot(P.snare), hats: rot(P.hats) }; if (P.ghost) o.ghost = { kick: rot(P.ghost.kick), snare: rot(P.ghost.snare), hats: rot(P.ghost.hats) }; if (P.vel) o.vel = { kick: rot(P.vel.kick), snare: rot(P.vel.snare), hats: rot(P.vel.hats) }; if (P.freq) o.freq = { kick: rot(P.freq.kick), snare: rot(P.freq.snare), hats: rot(P.freq.hats) }; return Object.assign({}, P, o); };
        const loopToGrid = (L: any) => { if (!L || !L.notes) return L; const T = (s2.firstDown || 0) + (L.bar - 1) * a2.barSec, xx = (T - (a2.firstDown || 0)) / stepS, bm = Math.floor(xx / 16), rem = Math.round(xx - bm * 16);
          const notes = L.notes.map((nn: any) => Object.assign({}, nn, { t: (((nn.t + rem) % 64) + 64) % 64 })).sort((p2: any, q2: any) => p2.t - q2.t); return Object.assign({}, L, { notes, bar: bm + 1 }); };
        if (k === "drums") { a2.pattern = rotPat(s2.pattern); a2.rhythm = s2.rhythm; a2.swing = s2.swing; a2.drumParts = (s2.drumParts || []).map((p: any) => Object.assign(rotPat(p), { startBar: Math.max(0, p.startBar + Math.floor(dRound / 16)) })); }
        if (k === "bass") { if (s2.bassline) a2.bassline = loopToGrid(s2.bassline); }
        if (k === "music") { if (s2.chords) a2.chords = s2.chords; if (s2.hook) a2.hook = loopToGrid(s2.hook); }
        a2.stems = { ...(a2.stems || {}), [k]: f.name }; a2.checks = Object.assign({}, a2.checks, k === "drums" ? { drums: false } : k === "bass" ? { bass: false } : {});
      });
      IDEAS.id = null; bumpIdeas(); note = ""; nav.show("overview");
      setTimeout(() => document.querySelector("#accuracy")?.scrollIntoView({ behavior: "smooth" }), 120);
    } catch { note = "Couldn't read that file. Try a WAV or MP3."; }
  }
</script>

<section class="panel" data-group="overview" id="accuracy">
  <h2>Check the results first (5 minutes)</h2>
  <p class="small">Everything else is built on these four. Each button takes you to the right spot and sets it up. Tick each one when it sounds right.</p>
  {#if !teardown.audioURL}<p class="tip">To use these checks, upload the song again at the top (saved teardowns don't keep the audio).</p>{/if}
  <div class="row" style="gap:10px"><b>{n} of {items.length} checked</b><div class="pbar" style="flex:1;min-width:120px"><i style:width={Math.round(100 * n / items.length) + "%"}></i></div></div>
  <div class="plan">
    {#each items as it (it.k)}
      <div class="pstep" class:done={!!checks[it.k]}>
        <header><label><input type="checkbox" checked={!!checks[it.k]} onchange={e => setCheck(it.k, e.currentTarget.checked)}>{it.title}</label>
          <button class="btn cool" type="button" style="padding:6px 12px;font-size:.84rem" onclick={it.go}>{it.btn}</button></header>
        <p class="small">{it.how}</p>
      </div>
    {/each}
  </div>
  <div class="stems">
    <h3>More accurate: add stems</h3>
    <p class="small">A full song has drums, bass and vocals bleeding into each other, which causes most wrong notes. A stem is one part on its own. Split this song into stems (FL Studio's stem separation if your version has it, or any stem splitter), then add them here. Use stems of this exact song so the timing matches.</p>
    {#each KINDS as [k, label, what] (k)}
      <div class="row stemrow">
        <input type="file" accept="audio/*" hidden aria-label={"Choose a " + label} bind:this={inputs[k]} onchange={e => useStem(k, label, e.currentTarget.files?.[0])}>
        <button class={"btn" + (stems[k] ? " cool" : "")} type="button" onclick={() => inputs[k]?.click()}>{(stems[k] ? "✓ " : "+ ") + label}</button>
        <span class="small">{stems[k] ? `Using ${stems[k]}` : what}</span>
      </div>
    {/each}
    <p class="small" role="status">{note}</p>
  </div>
</section>
