<!-- Build it: the step-by-step FL Studio plan, today's session, progress (legacy planPanel + todayCard). -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  import { planDone, setPlanDone } from "../lib/storage/data";
  import { account } from "../lib/storage/account.svelte";
  import { session } from "../lib/state/session.svelte";
  import { coach } from "../lib/state/coach.svelte";
  import MidiPreview from "./MidiPreview.svelte";
  import SongExports from "./SongExports.svelte";
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { buildPlan, genreOf, tdId } = domain;
  const a = $derived(teardown.result);
  const steps = $derived(buildPlan(a, genreOf(a)) as any[]);
  let done = $state<Set<string>>(new Set());
  $effect(() => { void account.rev; done = new Set(planDone(a)); });
  const total = $derived(steps.reduce((p, x) => p + x.m, 0));
  const next = $derived(steps.findIndex((_x, j) => !done.has("s" + j)));
  function toggle(id: string, on: boolean) { const d = new Set(done); if (on) d.add(id); else d.delete(id); done = d; setPlanDone(a, Array.from(d)); }
  const txt = $derived(steps.map((x, i) => `${i + 1}. ${x.t} (${x.m} min)\n` + x.s.map((t: string) => "   - " + t).join("\n") + (x.c ? "\n   ✓ You should see: " + x.c : "")).join("\n"));
  let copied = $state(false), copyFallback = $state(false);
  let cards: HTMLElement[] = $state([]);
  function startToday() { const x = steps[next]; session.start(`${a.title || "Rebuild"}: step ${next + 1}, ${x.t}`, 25, { id: tdId(a), step: next }); cards[next]?.scrollIntoView({ behavior: "smooth", block: "center" }); }
</script>

<section class="panel lesson" id="plan" data-group="build">
  <h2>Build it in FL Studio: step by step</h2>
  <p class="small">{`Rebuild this song at ${a.bpm} BPM in ${a.key} using the Piano roll and the Playlist only: one pattern per instrument, one Playlist track per instrument. Every step ends with what you should see, so you know it worked. Only plugins in your Signature Bundle and samples from your library.`}</p>
  {#if next < 0}
    <div class="today"><b>Every step is done.</b><span class="small"> Export it, upload it in Compare, and add it to your Journal.</span></div>
  {:else}
    <div class="today">
      <div><span class="eyebrow">Today's session · 25 minutes</span><h3>{`Step ${next + 1}: ${steps[next].t}`}</h3><p class="small">One goal, one timer. When the timer ends it's logged in your practice log, and you can tick the step off.</p></div>
      <div class="row"><button class="btn primary" type="button" onclick={startToday}>▶ Start 25 minutes</button></div>
    </div>
  {/if}
  <div class="pbar"><i style:width={Math.round(100 * done.size / steps.length) + "%"}></i></div>
  <span class="small">{`${done.size} of ${steps.length} done · about ${total} minutes in total`}</span>
  <div class="plan">
    {#each steps as x, i (i)}
      <div class="pstep" class:done={done.has("s" + i)} bind:this={cards[i]}>
        <header><label><input type="checkbox" checked={done.has("s" + i)} onchange={e => toggle("s" + i, e.currentTarget.checked)}>{`${i + 1}. ${x.t}`}</label><span class="mins">{x.m} min</span></header>
        <ol>{#each x.s as t, j (j)}<li>{t}</li>{/each}</ol>
        {#if x.c}<p class="seecheck"><b>You should see: </b>{x.c}</p>{/if}
        {#if x.midi}<MidiPreview m={x.midi} />{/if}
        {#if x.extra === "midi"}<SongExports kind="midi" />{:else if x.extra === "ref"}<SongExports kind="ref" />{/if}
        <div class="row"><button class="btn" type="button" onclick={() => coach.open(`I'm on this step of rebuilding the song: ${x.ask}`, true)}>Ask the coach about this step</button></div>
      </div>
    {/each}
  </div>
  <div class="row"><button class="btn" type="button" onclick={() => navigator.clipboard.writeText(txt).then(() => { copied = true; }, () => { copyFallback = true; })}>{copied ? "Copied" : "Copy the whole plan"}</button></div>
  {#if copyFallback}<textarea readonly style="height:160px">{txt}</textarea>{/if}
</section>
