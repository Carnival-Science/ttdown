<!-- Song map: what the song plays, rough hook and bass transcription (legacy transcriptionPanel). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { nav } from "../lib/state/player.svelte";
  import { ideaPlayer } from "../lib/audio/idea-player.svelte";
  import { domain } from "../lib/domain";
  import PianoRoll from "../lib/ui/music/PianoRoll.svelte";
  import { bumpIdeas } from "../lib/state/ideas.svelte";
  const { genreOf, noteList, IDEAS, makeIdeas, tdId, is808 } = domain as any;
  const a = $derived(teardown.result as any);
  const h = $derived(a.hook && a.hook.notes && a.hook.notes.length >= 3 ? a.hook : null);
  const b = $derived(a.bassline && a.bassline.notes && a.bassline.notes.length >= 2 ? a.bassline : null);
  const src = $derived(h || b);
  const bassGen = $derived(b ? b.notes.map((n: any) => ({ t: n.t, dur: n.dur, midi: n.midi - 12 })) : null);
  // legacy useB(): make sure this song's ideas exist, apply the change, then show the Idea generator
  function use(fn: () => void) { const gk = genreOf(a); if (IDEAS.id !== tdId(a)) Object.assign(IDEAS, makeIdeas(a, gk)); fn(); bumpIdeas(); nav.show("ideas"); setTimeout(() => document.getElementById("ideas")?.scrollIntoView({ behavior: "smooth" }), 60); }
</script>

{#if src}
  <section class="panel" data-group="map">
    <h2>What the song plays (rough transcription)</h2>
    {#if a.stems && (a.stems.bass || a.stems.music)}<p class="small">{`Using stems: ${[a.stems.bass, a.stems.music].filter(Boolean).join(", ")}. Much more reliable than the full mix.`}</p>
    {:else}<p class="tip">Rough draft: the hook is the hardest thing to hear in a full mix. Treat these notes as a starting point and change them until they sound right. Adding a melody stem (Overview tab) makes them much more accurate.</p>{/if}
    <p class="small">{`Heard in the ${src.from} starting at bar ${Math.max(1, src.bar)}, folded into a 4-bar loop. This is an estimate from the full mix, so expect some wrong or missing notes; check them with the loop and slow-down tools above. Note names are FL Studio's (middle C is C5).`}</p>
    {#snippet block(title: string, notes: any[], id: string, parts: any, useText: string, useFn: () => void)}
      <div class="layer idea">
        <div class="row" style="justify-content:space-between;gap:8px"><h3>{title}</h3>
          <div class="row" style="gap:6px">
            <button class="btn cool" type="button" onclick={() => ideaPlayer.play(id, parts, a.bpm, 4, true)}>{ideaPlayer.playing === id ? "■ Stop" : "▶ Play"}</button>
            <button class="btn" type="button" onclick={() => use(useFn)}>{useText}</button>
          </div>
        </div>
        <PianoRoll {notes} total={64} />
        <details><summary class="small">Show the notes to click in</summary><ul class="small mono">{#each noteList(notes) as t, i (i)}<li>{t}</li>{/each}</ul></details>
      </div>
    {/snippet}
    {#if h}{@render block("Hook / top line", h.notes, "tr-hook", { melody: h }, "Use as my melody idea", () => { IDEAS.melody = { label: "The song's own hook (rough transcription)", notes: h.notes.map((n: any) => Object.assign({}, n)) }; })}{/if}
    {#if b}{@render block("Bass / 808 notes (one per 8th note)", b.notes, "tr-bass", { bass: { notes: bassGen } }, "Use as my bass idea", () => { IDEAS.bass = { label: "The song's own bass notes (rough transcription)", notes: bassGen, sub: is808(a, genreOf(a)) }; })}{/if}
  </section>
{/if}
