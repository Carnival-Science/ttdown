<!-- Teardown (default view): upload, history, and the six parts of a teardown (legacy #view-teardown and render()). -->
<script lang="ts">
  import { onMount } from "svelte";
  import Tabs from "../lib/ui/Tabs.svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { nav } from "../lib/state/player.svelte";
  import { app } from "../lib/state/app.svelte";
  import Summary from "../teardown/Summary.svelte";
  import Accuracy from "../teardown/Accuracy.svelte";
  import MixMatch from "../teardown/MixMatch.svelte";
  import BuildPlan from "../teardown/BuildPlan.svelte";
  import Lesson from "../teardown/Lesson.svelte";
  import Ideas from "../teardown/Ideas.svelte";
  import SongMap from "../teardown/SongMap.svelte";
  import Chords from "../teardown/Chords.svelte";
  import Transcription from "../teardown/Transcription.svelte";
  import Drums from "../teardown/Drums.svelte";
  import Layers from "../teardown/Layers.svelte";
  import SamplesToGrab from "../teardown/SamplesToGrab.svelte";
  import ShelfMatch from "../teardown/ShelfMatch.svelte";
  import Mix from "../teardown/Mix.svelte";
  import Compare from "../teardown/Compare.svelte";
  import Share from "../teardown/Share.svelte";

  const PARTS = [
    { value: "overview", label: "Overview" }, { value: "build", label: "Build it" }, { value: "ideas", label: "Idea generator" },
    { value: "map", label: "Song map" }, { value: "sound", label: "Sounds and mix" }, { value: "compare", label: "Compare" },
  ] as const;
  const a = $derived(teardown.result);
  const ex = $derived(teardown.example);
  let tabsEl: HTMLDivElement, outEl: HTMLDivElement, over = $state(false);
  onMount(() => { nav.show = (k: string) => { teardown.tab = k; tabsEl?.scrollIntoView({ block: "start", behavior: "smooth" }); }; teardown.refreshHistory(); });
  // a finished upload scrolls the teardown into view, as before
  let lastStatus = "";
  $effect(() => { const t = teardown.status.text; if (t !== lastStatus && /^Teardown ready/.test(t)) { app.lastTeardown = teardown.result; outEl?.scrollIntoView({ behavior: "smooth" }); } lastStatus = t; });
  const drop = (e: DragEvent) => { e.preventDefault(); over = false; void teardown.analyzeFile(e.dataTransfer?.files[0]); };
</script>

<svelte:window onkeydown={e => { if (e.key === "Escape" && teardown.running) teardown.cancel(); }} />

<header class="hero">
  <span class="eyebrow">Learn from the songs you love</span>
  <h1>Track Teardown</h1>
  <p class="lead">Drop in a song you love. You get its tempo, key, drum pattern, arrangement and mix balance, turned into an FL Studio recipe: what to load, which plugins, what to EQ, and a practice plan to rebuild it yourself.</p>
</header>

<section class="drop" class:over id="drop" aria-label="Upload a song"
  ondragenter={e => { e.preventDefault(); over = true; }} ondragover={e => { e.preventDefault(); over = true; }} ondragleave={e => { e.preventDefault(); over = false; }} ondrop={drop}>
  <h2>1. Upload a song</h2>
  <p class="small">MP3, WAV, M4A or FLAC. It's analyzed right here in your browser and never uploaded anywhere.</p>
  <div class="row">
    <input type="file" id="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac" onchange={e => teardown.analyzeFile(e.currentTarget.files?.[0])}>
    <input type="text" id="title" placeholder="Song name and artist (optional)" aria-label="Song name and artist" style="max-width:320px" bind:value={teardown.title}>
    <button type="button" class="btn" id="cancel" hidden={!teardown.running} title="Stop analysing this file (Esc)" onclick={() => teardown.cancel()}>Cancel analysis</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="prog" style:width={teardown.progress + "%"}></div></div>
  <p class={"status" + (teardown.status.err ? " err" : "")} id="status" role="status">{teardown.status.text}</p>
</section>

<div id="hist-wrap" class="panel" hidden={!teardown.history.length && !teardown.histNote.text}>
  <h3>Your past teardowns</h3>
  <p id="hist-note" class={"small" + (teardown.histNote.bad ? " err" : "")} hidden={!teardown.histNote.text}>{teardown.histNote.text}</p>
  <div class="hist" id="hist">
    {#each teardown.history as h, i (i)}<button class="btn" onclick={() => { teardown.open(h); outEl?.scrollIntoView({ behavior: "smooth" }); }}>{`${h.title || "Untitled"} · ${h.bpm} · ${h.camelot}`}</button>{/each}
  </div>
</div>

<div id="out" style="display:grid;gap:18px" bind:this={outEl} data-example={ex ? "1" : null}>
  <div bind:this={tabsEl}></div>
  {#key teardown.mountId}
  <Tabs items={PARTS} label="Parts of this teardown" listClass="tdtabs" bind:value={teardown.tab}>
    {#snippet panel(item)}
      <div class="tdpanel" style="display:grid;gap:18px">
        {#if item.value === "overview"}
          <Summary />{#if !ex}<Accuracy /><MixMatch />{/if}
        {:else if item.value === "build"}
          {#if ex}<Lesson />{:else}<BuildPlan />{/if}
        {:else if item.value === "ideas"}
          <Ideas />
        {:else if item.value === "map"}
          <SongMap />{#if a.chords}<Chords />{/if}<Transcription /><Drums />
        {:else if item.value === "sound"}
          <Layers /><SamplesToGrab />{#if !ex}<ShelfMatch />{/if}<Mix />
        {:else}
          <Compare />{#if !ex}<Share />{/if}
        {/if}
      </div>
    {/snippet}
  </Tabs>
  {/key}
</div>
