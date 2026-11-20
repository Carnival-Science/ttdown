<!-- Before a track is loaded the central workspace is simply a large drop zone, with the recent tracks in it. There is no landing page:
     once a track is analysed this becomes the arrangement workspace. A file can also be dropped anywhere on the window (App.svelte). -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import RecentList from "./RecentList.svelte";
  import Circles from "../lib/ui/art/Circles.svelte";
  import { workspace } from "../lib/state/workspace.svelte";
  const mode = $derived(teardown.running ? "analyse" : workspace.dragging ? "converge" : "idle");
  const open = () => document.getElementById("file")?.click();
</script>

<section class="dropzone" id="empty" aria-labelledby="drop-h" data-mode={mode}>
  <div class="art"><Circles {mode} progress={teardown.progress} /></div>
  <div class="inner">
    {#if teardown.running}
      <h2 id="drop-h">Taking it apart</h2>
      <p class="stage mono" aria-live="polite">{teardown.status.text} <span class="pct">{Math.round(teardown.progress)}%</span></p>
    {:else}
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
    {/if}
  </div>
</section>

<style>
  .dropzone { position: relative; overflow: hidden; flex: 1; min-height: 0; display: grid; place-items: center; padding: 24px; border: 1px dashed var(--tt-line-2); border-radius: 0; background: var(--tt-panel); transition: border-color var(--tt-ease), background-color var(--tt-ease); }
  :global(.app.dragging) .dropzone { border-color: var(--tt-accent); }
  /* the art sits behind the words, offset to the upper left like a printed card; the words keep a paper ground to stay readable */
  .art { position: absolute; inset: 0 16% 0 0; opacity: .9; overflow: hidden; }
  [data-mode="analyse"] .art, [data-mode="converge"] .art { inset: 0; }
  .stage { margin: 0; color: var(--tt-ink-2); font-size: var(--tt-fs-sm); max-width: 48ch; }
  .stage .pct { color: var(--tt-ink); font-weight: 600; margin-left: 6px; }
  .inner { position: relative; display: grid; gap: 12px; justify-items: center; text-align: center; max-width: 60ch; padding: 20px 24px; background: color-mix(in srgb, var(--tt-panel) 86%, transparent); backdrop-filter: blur(2px); }
  /* the headline sits on a band of the brand lime, like a highlighter on newsprint */
  h2 { font: 800 clamp(1.6rem, 3.4vw, 2.4rem)/1.1 var(--tt-font-display); font-stretch: 78%; padding: 0 6px; background: var(--tt-lime-grad) left 88% / 100% 0.42em no-repeat; }
  .lede { margin: 0; display: flex; align-items: center; gap: 8px; color: var(--tt-ink-2); }
  .small { margin: 0; }
  .gets { color: var(--tt-ink-3); }
  .recents { display: grid; gap: 8px; justify-items: center; margin-top: 8px; width: 100%; }
  .list { width: min(520px, 100%); }
</style>
