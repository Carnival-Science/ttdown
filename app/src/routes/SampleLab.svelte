<!-- Sample Lab: analyse one-shots and loops, type, note/BPM, key fit, suggested name and folder, shelf, sample coach
     (legacy renderSampleLab / sampleCard / renderSampleGrid / renderShelf / askAboutSample). Analysis is the shared analyzeSample. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { lab } from "../lib/state/samplelab.svelte";
  import { app } from "../lib/state/app.svelte";
  import { audio } from "../lib/audio/service.svelte";
  import { account } from "../lib/storage/account.svelte";
  import { shelfList, isShelved, shelve, unshelve } from "../lib/storage/data";
  import { useCap } from "../lib/runtime/claude";
  import { domain } from "../lib/domain";
  import { engine } from "../lib/engine";
  const { analyzeSample, keyFit, suggestName, STYPES, SFOLDER, STIP } = domain as any;
  const NAMES = engine.NAMES as string[];
  $effect(() => { if (!lab.key && app.lastTeardown) lab.key = app.lastTeardown.key; });
  let st = $state("Drop one-shots or short loops (up to 60 s each, 60 files at a time). They're analyzed in your browser and never uploaded."), progress = $state(0), over = $state(false), rev = $state(0);
  async function take(files: FileList | File[] | null | undefined) {
    if (!files) return;
    const fs = Array.from(files).filter(f => /audio|\.wav$|\.mp3$|\.aiff?$|\.flac$|\.ogg$|\.m4a$/i.test(f.type + f.name)).slice(0, 60);
    if (!fs.length) { st = "No audio files found. Use WAV, MP3, AIFF, FLAC, OGG or M4A."; return; }
    let i = 0, skipped = 0; const added: any[] = [];
    for (const f of fs) {
      i++; st = `Analyzing ${i} of ${fs.length}: ${f.name}`; progress = 100 * i / fs.length;
      if (f.size > 12e6) { skipped++; continue; }
      try { const a = await analyzeSample(f); if (a.dur > 60) { skipped++; continue; } a.id = "s" + Date.now() + "-" + i; a.url = URL.createObjectURL(f); added.unshift(a); }
      catch { skipped++; }
      await engine.tick();
    }
    lab.items = added.concat(lab.items);
    st = `Done: ${fs.length - skipped} analyzed${skipped ? `, ${skipped} skipped (too long, too big or unreadable)` : ""}.`;
    lab.filter = "All";
  }
  const counts = $derived.by(() => { const c: Record<string, number> = {}; lab.items.forEach(i => c[i.type] = (c[i.type] || 0) + 1); return c; });
  const shown = $derived(lab.filter === "All" ? lab.items : lab.items.filter(i => i.type === lab.filter));
  const setType = (it: any, t: string) => { lab.items = lab.items.map(x => x === it ? Object.assign(x, { type: t }) : x); rev++; };
  // playback: one sample at a time, at the song volume
  let playing = $state<string | null>(null); let el: HTMLAudioElement | null = null; let unreg: (() => void) | null = null;
  function play(it: any) {
    if (el && !el.paused && playing === it.id) { el.pause(); playing = null; return; }
    if (el) el.pause(); unreg?.();
    el = new Audio(it.url); unreg = audio.player(el); playing = it.id; el.play().catch(() => {}); el.onended = () => { playing = null; };
  }
  function wave(env: number[]) { return (cv: HTMLCanvasElement) => { requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, h = cv.clientHeight || 54;
    cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext("2d")!; g.scale(dpr, dpr);
    const m = Math.max(...env, 1e-6); g.fillStyle = "#ff7a1a";
    for (let x = 0; x < w; x++) { const v = env[Math.floor(x / w * env.length)]! / m; const bh = Math.max(1, v * (h - 6)); g.fillRect(x, (h - bh) / 2, 1, bh); }
  }); }; }
  let copied = $state<Record<string, string>>({});
  const shelf = $derived.by(() => { void rev; void account.rev; const l = shelfList(), by: Record<string, any[]> = {}; l.forEach((x: any) => (by[x.kind] = by[x.kind] || []).push(x)); return by; });
  // sample coach
  let coachText = $state("Press “Ask the coach” on any sample for tips on using it."), coachBox: HTMLElement;
  async function ask(it: any) {
    coachBox?.scrollIntoView({ behavior: "smooth", block: "center" });
    const sample = await useCap("sample");
    if (!sample) { coachText = "The coach isn't available in this view. Open this page on claude.ai to use it."; return; }
    coachText = "Thinking…";
    const data = { file: it.name, detected_type: it.type, length_s: it.dur, note: it.note ? it.note.name + " (" + it.note.cents + " cents)" : "none", bpm: it.bpm, peak_db: it.peakDb, brightness_hz: it.centroid, low_end_share: it.lowShare, project_key: lab.key || "not set" };
    const prompt = `You are a friendly FL Studio coach for a beginner making rage/hyperpop/house beats. Here is an automatic analysis of one sample they just loaded (estimates; say "check by ear" if unsure). In under 150 words: say what this sound is good for, give 3 concrete FL Studio steps to use it well (exact plugin or menu names), and one creative idea. No headings.\n\n${JSON.stringify(data)}`;
    try { const r = await sample(prompt, { onText: ({ text }: any) => { coachText = text; } }); coachText = r.text || coachText; }
    catch (e: any) { coachText = e && e.code === "rate_limited" ? "Too many questions at once. Wait a minute." : e && e.code === "not_granted" ? "The coach needs your permission to answer. Try again and allow it." : "The coach couldn't answer just now."; }
  }
</script>

<header class="hero"><span class="eyebrow">One-shots · loops · 808s</span><h1>Sample Lab</h1><p class="lead">Drop in small samples to hear them, see what each one is (kick, 808, hat, loop…), its note or BPM, whether it fits your key, where it belongs in your library, and how to use it in FL Studio.</p></header>
<section class="drop" class:over id="lab-drop" aria-label="Drop your samples"
  ondragenter={e => { e.preventDefault(); over = true; }} ondragover={e => { e.preventDefault(); over = true; }} ondragleave={e => { e.preventDefault(); over = false; }} ondrop={e => { e.preventDefault(); over = false; void take(e.dataTransfer?.files); }}>
  <h2>Drop your samples</h2>
  <div class="row">
    <input type="file" id="lab-files" multiple accept="audio/*,.wav,.mp3,.aif,.aiff,.flac,.ogg,.m4a" onchange={e => take(e.currentTarget.files)}>
    <label class="small" for="lab-key">Your project key:</label>
    <select id="lab-key" aria-label="Your project key" style="font:inherit;color:var(--ink);background:var(--inset);border:1px solid #000;border-radius:9px;padding:8px" value={lab.key || ""} onchange={e => { lab.key = e.currentTarget.value || null; }}>
      <option value="">No key set</option>{#each NAMES.flatMap(nm => ["minor", "major"].map(m => nm + " " + m)) as k (k)}<option value={k}>{k}</option>{/each}
    </select>
  </div>
  <p class="status" role="status">{st}</p>
  <div class="progress" aria-hidden="true"><div id="lab-prog" style:width={progress + "%"}></div></div>
</section>
<section class="panel">
  <div class="row" style="justify-content:space-between"><h2>Your samples</h2><span class="small" id="lab-summary">{lab.items.length ? `${lab.items.length} sample${lab.items.length === 1 ? "" : "s"} analyzed. Change a type if it guessed wrong; the folder and name update.` : ""}</span></div>
  <div class="filters" id="lab-filters">{#if lab.items.length}{#each ["All"].concat(STYPES.filter((t: string) => counts[t])) as t (t)}<button aria-pressed={(lab.filter === t)} onclick={() => { lab.filter = t; }}>{t === "All" ? `All (${lab.items.length})` : `${t} (${counts[t]})`}</button>{/each}{/if}</div>
  <div class="sgrid" id="lab-grid">
    {#if !lab.items.length}<p class="small">Your analyzed samples show up here.</p>{/if}
    {#key rev}
    {#each shown as it (it.id)}
      {@const fit = keyFit(it, lab.key)}{@const nm = suggestName(it)}{@const saved = isShelved(it)}
      <div class="scard">
        <header><button class="playbtn" aria-label={"Play " + it.name} onclick={() => play(it)}>{playing === it.id ? "■" : "▶"}</button><b title={it.name}>{it.name}</b>
          <select aria-label="Sound type" value={it.type} onchange={e => setType(it, e.currentTarget.value)}>{#each STYPES as t (t)}<option value={t}>{t}</option>{/each}</select></header>
        <canvas aria-hidden="true" {@attach wave(it.env)}></canvas>
        <div class="chips">
          <span class="chip">{it.dur + " s"}</span>
          {#if it.bpm}<span class="chip">{it.bpm + " BPM"}</span>{/if}
          {#if it.note}<span class="chip">{it.note.name + (Math.abs(it.note.cents) > 15 ? ` (${it.note.cents > 0 ? "+" : ""}${it.note.cents}¢)` : "")}</span>{/if}
          {#if fit}<span class={"chip " + (fit.ok ? "ok" : "warn")}>{fit.text}</span>{/if}
          <span class="chip">{"peak " + it.peakDb + " dB"}</span>
          {#if it.peakDb > -0.3}<span class="chip warn">Clipping risk</span>{/if}
        </div>
        <div class="small">{"Library folder: samples\\" + SFOLDER[it.type]}</div>
        <div class="sname">{nm}</div>
        <p class="why">{STIP[it.type]}</p>
        <div class="row">
          <button class="btn" style="padding:5px 10px;font-size:0.8rem" onclick={() => navigator.clipboard.writeText(nm).then(() => { copied[it.id] = "Copied"; }, () => { copied[it.id] = "Copy blocked"; })}>{copied[it.id] || "Copy name"}</button>
          <button class={saved ? "btn" : "btn cool"} style="padding:5px 10px;font-size:0.8rem" onclick={() => { shelve(it); rev++; }}>{saved ? "★ On your shelf" : "☆ Save to shelf"}</button>
          <button class="btn" style="padding:5px 10px;font-size:0.8rem" onclick={() => ask(it)}>Ask the coach</button>
        </div>
      </div>
    {/each}
    {/key}
  </div>
</section>
<section class="panel"><h2>Sample coach</h2><div class="answer" id="lab-coach" role="status" bind:this={coachBox}>{coachText}</div></section>
<section class="panel">
  <h2>Your shelf</h2>
  <p class="small">Saved favorites, with suggested names and folders. Audio stays on your computer; the shelf keeps the details.</p>
  <div id="lab-shelf" style="display:grid;gap:12px">
    {#if !Object.keys(shelf).length}<p class="small">Nothing saved yet. Press ☆ Save to shelf on sounds you like; your shelf syncs to your account.</p>
    {:else}
      {#each Object.keys(shelf) as k (k)}
        <div style="display:grid;gap:6px"><h3>{`${k} (${shelf[k]!.length})`}</h3>
          <div class="scroll"><table><tbody>{#each shelf[k]! as x (x.id)}<tr><td>{x.suggested || x.name}</td><td class="num">{x.note || (x.bpm ? x.bpm + " BPM" : "")}</td><td class="small">{"samples\\" + x.folder}</td><td><button class="btn" style="padding:2px 8px;font-size:0.75rem" aria-label="Remove from shelf" onclick={() => { unshelve(x.id); rev++; }}>Remove</button></td></tr>{/each}</tbody></table></div>
        </div>
      {/each}
    {/if}
  </div>
</section>
