<!-- Idea generator (legacy ideaPanel): drum, snare, bass/808, chord, melody, vocal-chop and arrangement ideas in the song's key and
     tempo, previews, favourites, "my sounds" kit, MIDI zip. The generators are the shared src/domain.js; IDEAS is its settings object. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { untrack } from "svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  import { ideaPlayer } from "../lib/audio/idea-player.svelte";
  import { favList, favAdd, favDel } from "../lib/storage/data";
  import { account } from "../lib/storage/account.svelte";
  import { saveFile, safeName } from "../lib/files/download";
  import { fold } from "../lib/ui/fold";
  import Rack from "../lib/ui/music/Rack.svelte";
  import PianoRoll from "../lib/ui/music/PianoRoll.svelte";

  const D = domain as any;
  const { IDEAS, makeIdeas, tdId, genreOf, genDrums, genChords, genBass, genMelody, genChop, genArrangement, STYLES, wText, KIT, KIT_SLOTS, KIND_NAME, SNARE_EX, idxOf, posOf, B16, noteList, flNote, zipStore, ideaMidiFiles } = D;
  const a = $derived(teardown.result);
  const gk = $derived(genreOf(a));
  import { ideasSignal, bumpIdeas } from "../lib/state/ideas.svelte";
  const rev = $derived(ideasSignal.rev);
  const draw = bumpIdeas;
  // legacy ideasFor(): one set of ideas per song, kept until the song changes
  const I = $derived.by(() => { void rev; const id = tdId(a); if (IDEAS.id !== id) untrack(() => Object.assign(IDEAS, makeIdeas(a, gk))); return IDEAS as any; });
  const P = (id: string, parts: () => any, bars = 4, noFill = false) => ideaPlayer.play(id, parts(), a.bpm, bars, noFill);
  const lbl = (id: string, text: string) => (ideaPlayer.playing === id ? "■ Stop" : text);
  const regenAll = () => { ideaPlayer.stop(); I.drums = genDrums(a, gk); I.chords = genChords(a); I.bass = genBass(a, I.chords, I.drums, gk); I.melody = genMelody(a, I.chords); I.chop = genChop(a); I.arr = genArrangement(a, gk); draw(); };
  const fresh = (fn: () => void) => { ideaPlayer.stop(); fn(); draw(); };
  const star = (kind: string) => { favAdd(kind, I[kind], a); draw(); };
  let weird = $state(Math.round(IDEAS.weird * 100));
  let dlNote = $state("");
  async function pack() {
    const filename = `${safeName(a.title, "ideas")} - MIDI ideas ${Math.round(a.bpm)} BPM ${a.key}.zip`;
    try { await saveFile(filename, zipStore(ideaMidiFiles(a, I)), "application/zip"); dlNote = "Saved. Unzip it, then import each file in that instrument's Piano roll: small arrow → File → Import MIDI file."; }
    catch (e: any) { dlNote = e && e.code === "declined" ? "Download cancelled." : e && e.code === "rate_limited" ? "A download prompt is already open. Try again in a moment." : "Downloads aren't available in this view. Use the note lists under each idea instead."; }
  }
  const favs = $derived.by(() => { void rev; void account.rev; return favList(); });
  const semis = (m: number) => { const v = m - I.chop.base; return v === 0 ? "root" : (v > 0 ? "+" : "") + v; };
  const up12 = (ns: any[]) => ns.map(n => ({ ...n, midi: n.midi + 12 }));
  // "my sounds" kit
  const kitAny = $derived.by(() => { void rev; return KIT_SLOTS.some(([k]: [string]) => KIT[k]); });
  async function loadKit(files: FileList | null, slot?: string) { if (!files) return; for (const f of Array.from(files)) await ideaPlayer.kitLoad(f, slot); draw(); }
  const kitInputs: Record<string, HTMLInputElement> = {}; let multi: HTMLInputElement;
  // initial fold state, as legacy tidy(): main ideas open, the rest folded
  const openKit = KIT_SLOTS.some(([k]: [string]) => KIT[k]);
  let copiedArr = $state(false);
</script>

<section class="panel" id="ideas" data-group="ideas">
  <h2>Idea generator</h2>
  <p class="small">{`Fresh ideas that fit this song: ${a.bpm} BPM, ${a.key}. Press ▶ to hear one, ↻ for a different one. They start from what the song does; every ↻ gives you something new to make it yours. Sounds here are simple previews; your own samples will sound better.`}</p>
  <div class="row">
    <button class="btn cool" type="button" onclick={() => P("all", () => ({ drums: I.drums, bass: I.bass, chords: I.chords, melody: I.melody }))}>{lbl("all", "▶ Play everything together")}</button>
    <button class="btn primary" type="button" onclick={regenAll}>↻ New ideas for everything</button>
    <button class="btn" type="button" onclick={pack}>Download as MIDI (.zip)</button><span class="small" role="status">{dlNote}</span>
  </div>
  <div class="row ictl">
    <label class="small" for="idea-style">Style </label>
    <select id="idea-style" class="isel" aria-label="Style of the ideas" value={I.style} onchange={e => { I.style = e.currentTarget.value; regenAll(); }}>
      {#each Object.keys(STYLES) as k (k)}<option value={k}>{STYLES[k]}</option>{/each}
    </select>
    <label class="small" for="idea-weird">Weirdness</label>
    <input id="idea-weird" type="range" min="0" max="100" step="5" aria-label="Weirdness" style="width:150px;accent-color:var(--accent)" bind:value={weird} oninput={() => { IDEAS.weird = weird / 100; }} onchange={regenAll}>
    <span class="small mono">{wText(weird / 100)}</span>
  </div>
  <div class="kit" {@attach fold({ open: openKit, head: "b" })}>
    <b>Preview with my sounds</b>
    <p class="small">Load your own samples and every ▶ uses them in place of the built-in sounds. 808s and chops are pitched to the notes automatically. They stay loaded until you close the page.</p>
    <div class="row" style="gap:6px">
      {#each KIT_SLOTS as [k, label] (k)}
        <span><input type="file" accept="audio/*" hidden aria-label={"Choose a sample for " + label} bind:this={kitInputs[k]} onchange={e => loadKit(e.currentTarget.files, k)}>
          <button class={"btn" + (KIT[k] && rev >= 0 ? " cool" : "")} type="button" onclick={() => kitInputs[k]?.click()}>{label + ": " + (rev >= 0 && KIT[k] ? KIT[k].name.replace(/\.[^.]+$/, "").slice(0, 24) : "built-in")}</button></span>
      {/each}
      <input type="file" accept="audio/*" multiple hidden aria-label="Load several samples" bind:this={multi} onchange={e => loadKit(e.currentTarget.files)}>
      <button class="btn" type="button" onclick={() => multi.click()}>Load several, sort them for me</button>
      {#if kitAny}<button class="btn" type="button" onclick={() => { KIT_SLOTS.forEach(([k]: [string]) => { KIT[k] = null; }); draw(); }}>Clear</button>{/if}
    </div>
  </div>
  <p class="tip">MIDI into FL: unzip, select the instrument's channel, press F7, then in the Piano roll click the small arrow at the top-left → File → Import MIDI file… and pick the file. If the 808 sounds far too low, Ctrl+A then Ctrl+Up moves it up an octave.</p>

  {#snippet card(title: string, label: string, body: import("svelte").Snippet, btns: import("svelte").Snippet, tips: string[], open: boolean, id?: string, style?: string)}
    <div class="layer idea" {id} {style} {@attach fold({ open, head: ".row" })}>
      <div class="row" style="justify-content:space-between;gap:8px"><h3>{title}</h3><div class="row" style="gap:6px">{@render btns()}</div></div>
      <p class="ilabel">{label}</p>
      {@render body()}
      {#if tips.length}<ul>{#each tips as t, i (i)}<li>{t}</li>{/each}</ul>{/if}
    </div>
  {/snippet}
  {#snippet notesList(lines: string[])}
    <details><summary class="small">Show the notes to click in</summary><ul class="small mono">{#each lines as t, i (i)}<li>{t}</li>{/each}</ul></details>
  {/snippet}

  <div class="layers">
    {#key rev}
    {#snippet drumsBody()}
      <Rack rows={[{ name: "Kick", steps: I.drums.kick }, { name: "Snare / clap", steps: I.drums.snare, ghost: I.drums.ghost }, { name: "Hi-hats", steps: I.drums.hats }]} />
      <p class="small">{I.drums.fillLabel + ":"}</p>
      <Rack rows={[{ name: "Kick", steps: I.drums.fill.kick }, { name: "Snare / clap", steps: I.drums.fill.snare }, { name: "Hi-hats", steps: I.drums.fill.hats }]} />
    {/snippet}
    {#snippet drumsBtns()}
      <button class="btn cool" type="button" onclick={() => P("drums", () => ({ drums: I.drums }))}>{lbl("drums", "▶ Play")}</button>
      <button class="btn primary" type="button" onclick={() => fresh(() => { I.drums = genDrums(a, gk); I.bass = genBass(a, I.chords, I.drums, gk); })}>↻ New idea</button>
      <button class="btn" type="button" title="Save this idea" aria-label="Save this idea to your favorites" onclick={() => star("drums")}>☆ Save</button>
    {/snippet}
    {@render card("Drum groove", I.drums.label, drumsBody, drumsBtns, [
      "When: main groove on bars 1–3, the fill on bar 4 (or only bar 8 if it feels too busy).",
      I.drums.roll.length ? `Hat roll at beats ${I.drums.roll.map(posOf).join(", ")}: in the hat's Piano roll set Snap to 1/2 step and add a second note halfway through each of those squares.` : "Every 8 bars, change one thing in the hats (add an open hat, or remove 2 hits) so the loop doesn't get stale.",
      "Dim notes are ghost notes: draw them, then pull their velocity down to about 30% in the Piano roll's velocity lane."], true)}

    {#snippet snareBody()}
      {#each SNARE_EX as x, i (i)}
        {@const match = idxOf(a.pattern.snare).join() === x.s.join()}
        <div class="snx">
          <div class="row" style="gap:8px">
            <button class="btn cool" type="button" onclick={() => P("snx" + i, () => ({ drums: Object.assign({}, I.drums, { snare: B16(x.s), ghost: B16(x.g) }) }), 2, true)}>{lbl("snx" + i, "▶")}</button>
            <b>{x.n}</b><span class="small mono">{"beats " + x.s.map(posOf).join(", ") + (x.g.length ? " · ghosts " + x.g.map(posOf).join(", ") : "")}</span>
            {#if match}<span class="tag">this song</span>{/if}
          </div>
          <Rack rows={[{ name: "Snare / clap", steps: B16(x.s), ghost: B16(x.g) }]} />
          <p class="small">{x.w}</p>
        </div>
      {/each}
    {/snippet}
    {#snippet none()}{/snippet}
    {@render card("Snare and clap placements", "Seven places to put the backbeat. ▶ plays each one over the kick and hats above.", snareBody, none, [], false)}

    {#snippet bassBody()}<PianoRoll notes={up12(I.bass.notes)} total={64} />{@render notesList(noteList(up12(I.bass.notes)))}{/snippet}
    {#snippet bassBtns()}
      <button class="btn cool" type="button" onclick={() => P("bass", () => ({ drums: I.drums, bass: I.bass }))}>{lbl("bass", "▶ Play")}</button>
      <button class="btn primary" type="button" onclick={() => fresh(() => { I.bass = genBass(a, I.chords, I.drums, gk); })}>↻ New idea</button>
      <button class="btn" type="button" title="Save this idea" aria-label="Save this idea to your favorites" onclick={() => star("bass")}>☆ Save</button>
    {/snippet}
    {@render card(I.bass.sub ? "808 line" : "Bassline", I.bass.label, bassBody, bassBtns, [
      "It follows the kick and the chord of each bar, so the low end stays tight.",
      "When: keep it simple in verses; use the busier version (octave pops or glides) in the hook or drop.",
      I.bass.notes.some((n: any) => n.glide) ? "Blue notes glide: channel settings → wrench tab → Polyphony → Mono + Porta, and let the note overlap the next one." : "Stretch each 808 note until just before the next one so they don't overlap and get muddy."], true)}

    {#snippet chordsBody()}
      <div class="row" style="gap:8px">{#each I.chords.chords as c, i (i)}<div class="stat" style="min-width:110px"><b>{c.name}</b><small>{"Bar " + (i + 1) + ": " + c.notes.map(flNote).join(" · ")}</small></div>{/each}</div>
    {/snippet}
    {#snippet chordsBtns()}
      <button class="btn cool" type="button" onclick={() => P("chords", () => ({ chords: I.chords, drums: I.drums }))}>{lbl("chords", "▶ Play")}</button>
      <button class="btn primary" type="button" onclick={() => fresh(() => { I.chords = genChords(a); I.bass = genBass(a, I.chords, I.drums, gk); I.melody = genMelody(a, I.chords); })}>↻ New idea</button>
      <button class="btn" type="button" title="Save this idea" aria-label="Save this idea to your favorites" onclick={() => star("chords")}>☆ Save</button>
      {#if !I.chords.own}<button class="btn" type="button" onclick={() => fresh(() => { I.chords = genChords(a, true); I.bass = genBass(a, I.chords, I.drums, gk); I.melody = genMelody(a, I.chords); })}>Song's chords</button>{/if}
    {/snippet}
    {@render card("Chords", I.chords.label + " · rhythm: " + I.chords.rhythm.label, chordsBody, chordsBtns, [
      "A new chord idea also rewrites the bass and melody so they still fit.",
      "When: hold the chords in the intro and breakdown; switch to stabs or pulses in the drop for energy.",
      "FLEX pads or FL Keys both work. High-pass at 150 Hz so they stay out of the bass."], true)}

    {#snippet melBody()}<PianoRoll notes={I.melody.notes} total={64} />{@render notesList(noteList(I.melody.notes))}{/snippet}
    {#snippet melBtns()}
      <button class="btn cool" type="button" onclick={() => P("melody", () => ({ chords: I.chords, melody: I.melody, drums: I.drums }))}>{lbl("melody", "▶ Play")}</button>
      <button class="btn primary" type="button" onclick={() => fresh(() => { I.melody = genMelody(a, I.chords); })}>↻ New idea</button>
      <button class="btn" type="button" title="Save this idea" aria-label="Save this idea to your favorites" onclick={() => star("melody")}>☆ Save</button>
    {/snippet}
    {@render card("Melody / hook", I.melody.label, melBody, melBtns, [
      "Bars 1–2 ask a question; bars 3–4 repeat it and answer by landing on the home note.",
      "When: save the full melody for the hook or drop. In the intro, play only bars 1–2 or filter it.",
      "Make it yours: move one note, or delete one. Small changes are how a generated idea becomes your hook."], true)}

    {#snippet chopBody()}
      <PianoRoll notes={I.chop.notes.filter((n: any) => n.t < 32)} total={32} label={semis} />
      {@render notesList(noteList(I.chop.notes.filter((n: any) => n.t < 32), (m: number) => semis(m) + " (" + flNote(m) + ")"))}
    {/snippet}
    {#snippet chopBtns()}
      <button class="btn cool" type="button" onclick={() => P("chop", () => ({ chop: I.chop, drums: I.drums }), 2, true)}>{lbl("chop", "▶ Play")}</button>
      <button class="btn primary" type="button" onclick={() => fresh(() => { I.chop = genChop(a); })}>↻ New idea</button>
      <button class="btn" type="button" title="Save this idea" aria-label="Save this idea to your favorites" onclick={() => star("chop")}>☆ Save</button>
    {/snippet}
    {@render card("Vocal chop rhythm", I.chop.label, chopBody, chopBtns, [
      "Drag one chop from samples → Vocals → Chops & One-shots into the Channel Rack, then draw these notes in its Piano roll. \"root\" is the chop's own pitch; +7 means 7 semitones up.",
      "Check Sample Lab for the chop's note first. If it isn't in " + a.key + ", pitch it with the channel's pitch knob until root sounds right.",
      "When: use it as an answer between melody phrases, or on its own in the breakdown. Mute it in verses.",
      "Mix: high-pass at 200 Hz, a little Fruity Reeverb 2 (15–25% wet) and Fruity Delay 3 at 1/8."], false)}

    {#snippet arrBody()}
      <div class="scroll"><table><thead><tr>{#each ["Bars", "Section", "What's playing", "Move to apply at the end"] as h (h)}<th>{h}</th>{/each}</tr></thead>
        <tbody>{#each I.arr.rows as r, i (i)}<tr><td class="num">{r.bars}</td><td><b>{r.name}</b></td><td>{r.on}</td><td>{r.move}</td></tr>{/each}</tbody></table></div>
    {/snippet}
    {#snippet arrBtns()}
      <button class="btn primary" type="button" onclick={() => fresh(() => { I.arr = genArrangement(a, gk); })}>↻ New idea</button>
      <button class="btn" type="button" title="Save this idea" aria-label="Save this idea to your favorites" onclick={() => star("arr")}>☆ Save</button>
      <button class="btn" type="button" onclick={() => { const t = I.arr.rows.map((r: any) => `Bars ${r.bars} ${r.name}: ${r.on} → ${r.move}`).join("\n"); navigator.clipboard.writeText(t).then(() => { copiedArr = true; }, () => {}); }}>{copiedArr ? "Copied" : "Copy"}</button>
    {/snippet}
    {@render card("Arrangement plan", I.arr.label, arrBody, arrBtns, [
      "Rule of 8: change something every 8 bars (add or remove one part), and something small every 4 (a fill).",
      "Build the loudest section first, then make the other sections by taking parts away."], false)}
    {/key}

    <div class="layer idea" id="favs" style="border-left-color:var(--good)" {@attach fold({ open: favs.length > 0, head: "h3" })}>
      <h3>{`Saved ideas (${favs.length})`}</h3>
      {#if favs.length}
        <div class="favs">
          {#each favs.slice(0, 40) as f (f.id)}
            <div class="row fav">
              <span class="tag">{KIND_NAME[f.kind] || f.kind}</span><span class="flabel">{f.label}</span><span class="small mono">{`${f.song || "untitled"} · ${f.bpm} BPM · ${f.key}`}</span>
              {#if f.kind !== "arr"}<button class="btn cool" type="button" onclick={() => P("fav" + f.id, () => ({ [f.kind]: f.data }), f.kind === "chop" ? 2 : 4, true)}>{lbl("fav" + f.id, "▶")}</button>{/if}
              <button class="btn" type="button" title="Put this idea back into the generator" onclick={() => { ideaPlayer.stop(); I[f.kind] = f.data; draw(); document.getElementById("ideas")?.scrollIntoView({ behavior: "smooth" }); }}>Load</button>
              <button class="btn" type="button" onclick={() => { favDel(f.id); draw(); }}>Remove</button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="small">Press ☆ Save on any idea to keep it here. Saved ideas follow your Claude account to any device.</p>
      {/if}
    </div>
  </div>
</section>
