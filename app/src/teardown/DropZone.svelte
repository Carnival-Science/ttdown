<!-- Before a track is loaded the central workspace is simply a large drop zone, with the recent tracks in it. There is no landing page:
     once a track is analysed this becomes the arrangement workspace. A file can also be dropped anywhere on the window (App.svelte). -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import RecentList from "./RecentList.svelte";
  const open = () => document.getElementById("file")?.click();
</script>

<section class="dropzone" id="empty" aria-labelledby="drop-h">
  <div class="inner">
    <h2 id="drop-h">Drop a track here</h2>
    <p class="lede">or <button type="button" class="btn primary" onclick={open}>Open track</button></p>
    <p class="small">MP3, WAV, M4A or FLAC, up to 8 minutes. It is analysed in this browser and never uploaded.</p>
    <p class="small gets">You'll get the tempo, the key, the arrangement on a bar-numbered timeline, and drums, chords and rough notes for each section, and what can be measured in the sound, each marked by how it is known.</p>
    {#if teardown.history.length}
      <div class="recents">
        <p class="small">Recent</p>
        <div class="list"><RecentList limit={6} /></div>
      </div>
    {/if}
  </div>
</section>

<style>
  .dropzone { flex: 1; min-height: 0; display: grid; place-items: center; padding: 24px; border: 2px dashed #3a3d46; border-radius: 18px; background: var(--tt-panel); transition: border-color var(--tt-ease), background-color var(--tt-ease); }
  :global(.app.dragging) .dropzone { border-color: var(--tt-accent); background: color-mix(in srgb, var(--tt-accent) 8%, var(--tt-panel)); }
  .inner { display: grid; gap: 12px; justify-items: center; text-align: center; max-width: 60ch; }
  h2 { font-size: clamp(1.4rem, 3vw, 2rem); }
  .lede { margin: 0; display: flex; align-items: center; gap: 8px; color: var(--tt-ink-2); }
  .small { margin: 0; }
  .gets { color: var(--tt-ink-3); }
  .recents { display: grid; gap: 8px; justify-items: center; margin-top: 8px; width: 100%; }
  .list { width: min(520px, 100%); }
</style>
