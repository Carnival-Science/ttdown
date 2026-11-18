<!-- Upload a track (input and drag and drop), cancel, progress and status, and saved teardowns. -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  let over = $state(false);
  const drop = (e: DragEvent) => { e.preventDefault(); over = false; void teardown.analyzeFile(e.dataTransfer?.files[0]); };
</script>

<svelte:document onkeydown={e => { if (e.key === "Escape" && teardown.running) teardown.cancel(); }} />

<section class="drop" class:over id="drop" aria-label="Upload a track"
  ondragenter={e => { e.preventDefault(); over = true; }} ondragover={e => { e.preventDefault(); over = true; }} ondragleave={e => { e.preventDefault(); over = false; }} ondrop={drop}>
  <h2>Upload a track</h2>
  <p class="small">MP3, WAV, M4A or FLAC, up to 8 minutes. It is analysed in this browser and never uploaded.</p>
  <div class="row">
    <input type="file" id="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac" onchange={e => teardown.analyzeFile(e.currentTarget.files?.[0])}>
    <input type="text" id="title" placeholder="Name (optional)" aria-label="Name of the track" style="max-width:320px" bind:value={teardown.title}>
    <button type="button" class="btn" id="cancel" hidden={!teardown.running} title="Stop analysing this file (Esc)" onclick={() => teardown.cancel()}>Cancel analysis</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="prog" style:width={teardown.progress + "%"}></div></div>
  <p class={"status" + (teardown.status.err ? " err" : "")} id="status" role="status">{teardown.status.text}</p>
</section>

<div id="hist-wrap" class="panel" hidden={!teardown.history.length && !teardown.histNote.text}>
  <h3>Saved in this browser</h3>
  <p id="hist-note" class={"small" + (teardown.histNote.bad ? " err" : "")} hidden={!teardown.histNote.text}>{teardown.histNote.text}</p>
  <div class="hist" id="hist">
    {#each teardown.history as h, i (i)}<button class="btn" onclick={() => { teardown.open(h); document.getElementById("out")?.scrollIntoView({ behavior: "smooth" }); }}>{`${h.title || "Untitled"} · ${h.bpm} BPM · ${h.key}`}</button>{/each}
  </div>
</div>
