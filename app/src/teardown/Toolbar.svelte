<!-- The toolbar: everything about getting a track in and finding your way, so none of it takes room from the work. Open a track (or drop
     one anywhere on the window), name it, reopen a recent one, see what the analysis is doing, and get help. -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import { workspace } from "../lib/state/workspace.svelte";
  import { BUILD } from "../lib/build/identity";
  import { timeMapSelfCheck } from "../lib/timemap";
  import Popover from "../lib/ui/Popover.svelte";
  import RecentList from "./RecentList.svelte";
  import Changelog from "./Changelog.svelte";

  let fileEl: HTMLInputElement;
  let recentOpen = $state(false);
  const tm = timeMapSelfCheck();
  const short = (s: string | null) => (s ? s.slice(0, 7) : "unknown");
  const pick = (e: Event & { currentTarget: HTMLInputElement }) => { const f = e.currentTarget.files?.[0]; void teardown.analyzeFile(f); e.currentTarget.value = ""; };
</script>

<svelte:document onkeydown={e => { if (e.key === "Escape" && teardown.running) teardown.cancel(); }} />

<header class="toolbar">
  <h1 class="brand"><svg class="mark" viewBox="0 0 40 28" aria-hidden="true"><circle cx="13" cy="14" r="11" fill="#8EBF5E" /><circle cx="25" cy="11" r="10" fill="#7FB38F" /><circle cx="22" cy="19" r="8" fill="#5E9A6A" /></svg><span class="word">teardown</span></h1>
  <input type="file" id="file" class="sr-only" tabindex="-1" bind:this={fileEl} accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac" onchange={pick}>
  <button type="button" class="btn primary open" onclick={() => fileEl.click()}>Open track</button>
  <input type="text" id="title" class="name" placeholder="Name (optional)" aria-label="Name of the track" maxlength="80" bind:value={teardown.title}
    oninput={() => teardown.nameEdited()} onchange={() => teardown.rename()} onkeydown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}>

  <Popover bind:open={recentOpen} triggerClass="btn recent" triggerId="recent-btn" label="Recent teardowns saved in this browser" keepMounted disabled={!teardown.history.length}
    id="hist-wrap" class="recent-pop" align="start">
    {#snippet trigger()}Recent{#if teardown.history.length} <span class="count">{teardown.history.length}</span>{/if}{/snippet}
    <p class="small recent-head">Saved in this browser</p>
    <div class="hist"><RecentList clearAll onopen={() => (recentOpen = false)} /></div>
  </Popover>

  <div class="statusbar">
    <p class={"status" + (teardown.status.err ? " err" : "")} id="status" role="status" title={teardown.status.text}>{teardown.status.text}</p>
  </div>
  <button type="button" class="btn" id="cancel" hidden={!teardown.running} title="Stop analysing this file (Esc)" onclick={() => teardown.cancel()}>Cancel</button>

  <Popover bind:open={workspace.helpOpen} triggerClass="btn help" label="Help: how to read the labels, accuracy, this build" keepMounted id="howto" class="help-pop" align="end">
    {#snippet trigger()}?{/snippet}
    <h2 class="help-title">How to read this</h2>
    <p><span class="basis basis-measured">Measured</span> Computed directly from the audio, like the length or the level.</p>
    <p><span class="basis basis-estimated">Estimated</span> Inferred by the analyzer, like the key, the sections or the drum pattern. Listen to it, check it, and correct it if it is wrong.</p>
    <p><span class="basis basis-assumed">Assumed</span> Not detected: the analyzer assumes it, like four beats per bar.</p>
    <p><span class="basis basis-unknown">Unknown</span> The analyzer can't tell, and says so instead of guessing.</p>
    <p class="small"><b>How reliable is it?</b> Teardown has so far been checked only on computer-generated songs with known answers. It has not been measured on real recordings, so treat every estimate as something to verify by ear. It follows one tempo and four beats per bar, and relative keys (such as A minor and C major) are easily confused.</p>
    <p class="small">Press any label to see what it means for that number.</p>
    <details class="about-build">
      <summary>About this build</summary>
      <dl class="about tt-mono" data-testid="build-info">
        <dt>Version</dt><dd>{BUILD.appVersion} ({BUILD.mode})</dd>
        <dt>Commit</dt><dd>{short(BUILD.gitSha)}{BUILD.gitDirty ? " + local changes" : ""}</dd>
        <dt>Engine</dt><dd>{BUILD.engineSha256.slice(0, 12)}</dd>
        <dt>TimeMap</dt><dd>{tm.schema}, {tm.fingerprint}</dd>
        <dt>Svelte</dt><dd>{BUILD.versions.svelte}</dd>
      </dl>
    </details>
  </Popover>
  <Changelog />
  {#if teardown.running || teardown.transcribing}<div class="progress" aria-hidden="true"><div id="prog" style:transform={`scaleX(${teardown.progress / 100})`}></div></div>{:else}<div class="progress" aria-hidden="true"><div id="prog" style:transform="scaleX(0)"></div></div>{/if}
</header>

<style>
  .toolbar { position: relative; display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--tt-chassis); border-bottom: 1px solid var(--tt-line-2); min-width: 0; }
  /* the wordmark: a compact bold sticker on the brand lime, with a hard early-web offset shadow */
  .brand { display: inline-flex; align-items: center; gap: 6px; margin: 0 10px 0 0; flex: none; color: var(--tt-ink); }
  .brand .word { font: 800 1.45rem/1 var(--tt-font-display); font-stretch: 68%; letter-spacing: -0.01em; }
  .brand .mark { width: 34px; height: 24px; }
  .brand .mark circle { mix-blend-mode: multiply; opacity: .8; transform-box: fill-box; transform-origin: center; transition: translate 600ms cubic-bezier(.23, 1, .32, 1); }
  .brand:hover .mark circle:nth-child(1) { translate: -2px 1px; } .brand:hover .mark circle:nth-child(2) { translate: 2px -1px; } .brand:hover .mark circle:nth-child(3) { translate: 1px 2px; }
  .toolbar :global(.btn) { min-height: 38px; }
  .name { width: 220px; flex: none; min-height: 38px; }
  .count { margin-left: 4px; padding: 0 5px; border-radius: 2px; background: var(--tt-ink); color: var(--tt-panel); font-size: .72rem; }
  .statusbar { flex: 1; min-width: 0; }
  .status { margin: 0; color: var(--tt-ink-2); font-size: var(--tt-fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status.err { color: var(--tt-bad); }
  .toolbar :global(.help) { width: 38px; padding: 0; font-weight: 700; flex: none; }
  .toolbar .progress { position: absolute; left: 0; right: 0; bottom: -1px; height: 3px; background: transparent; border: 0; border-radius: 0; margin: 0; }
  .toolbar .progress :global(#prog) { width: 100%; height: 100%; background: var(--tt-accent); transform-origin: left center; transition: transform 160ms linear; }
  :global(.help-pop) { width: min(380px, calc(100vw - 24px)); padding: 12px 16px; font-size: var(--tt-fs-sm); }
  :global(.help-pop p) { margin: 0 0 8px; }
  :global(.help-pop .help-title) { font-size: 1rem; margin: 0 0 8px; }
  :global(.recent-pop) { width: min(420px, calc(100vw - 24px)); padding: 12px; }
  :global(.recent-pop .hist) { display: grid; gap: 6px; max-height: 50dvh; overflow-y: auto; }
  
  .about { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 8px 0 0; font-size: var(--tt-fs-xs); }
  .about dt { color: var(--tt-ink-3); } .about dd { margin: 0; overflow-wrap: anywhere; }
  .about-build summary { cursor: pointer; color: var(--tt-ink-3); }

  @media (max-width: 1179px) {
    .toolbar { flex-wrap: wrap; padding: 8px 12px; gap: 8px; }
    .brand { flex: 1 1 auto; }
    .name { order: 5; flex: 1 1 100%; width: auto; }
    .statusbar { order: 6; flex: 1 1 100%; }
    .toolbar :global(.help) { order: 2; }
  }
  @media (max-width: 1179px) { .toolbar :global(.version) { order: 7; } .statusbar { flex: 1 1 calc(100% - 96px); } }
  @media (max-width: 480px) {
    .brand { font-size: .95rem; margin: 0; }
    .toolbar :global(.btn) { padding: 0 8px; }
  }
</style>
