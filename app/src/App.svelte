<!-- Teardown: upload a track and see how it is constructed. One workspace: the arrangement and the section editor in the main area, the
     findings and the export beside them (a sheet on a phone).
     Everything shown says how it is known (measured, estimated, assumed or unknown). -->
<script lang="ts">
  import { installTestHooks } from "./lib/testing/hooks";
  import { teardown } from "./lib/state/teardown.svelte";
  import { BUILD } from "./lib/build/identity";
  import { timeMapSelfCheck } from "./lib/timemap";
  import Basis from "./lib/ui/Basis.svelte";
  import Upload from "./teardown/Upload.svelte";
  import Workspace from "./teardown/Workspace.svelte";

  installTestHooks();
  $effect(() => { teardown.refreshHistory(); });
  // Runs the canonical TimeMap once; the smoke test compares this with Node (dev server and built bundle alike).
  const tm = timeMapSelfCheck();
  const short = (s: string | null) => (s ? s.slice(0, 7) : "unknown");
</script>

<main class="wrap" data-timemap-schema={tm.schema} data-timemap-fingerprint={tm.fingerprint}>
  <header class="top">
    <span class="logo" aria-hidden="true">T</span>
    <div><h1>Teardown</h1><p class="lead">Upload a track. See how it is built: tempo, key, arrangement, drums and chords, and what can be measured in the sound. Listen to each part, correct what's wrong, and take the timing and notes into any DAW.</p></div>
  </header>

  <Upload />

  <div id="out" class:has-result={!!teardown.result}>
    {#if teardown.result}
      {#key teardown.mountId}
        <Workspace />
      {/key}
    {:else}
      <section class="panel" id="empty">
        <h2>What you'll get</h2>
        <ul>
          <li><b>Tempo</b> and whether it stays steady, with the beat positions it was read from.</li>
          <li><b>Key</b>, with the other keys it could be.</li>
          <li><b>Arrangement</b>: sections on a bar-numbered timeline you can click, hear and loop.</li>
          <li><b>Drums and chords</b> for each section, which you can play over the song to check them.</li>
          <li><b>Measured sound</b>: level, dynamics, stereo width and where the energy sits.</li>
        </ul>
      </section>
    {/if}
  </div>

  <section class="panel" id="howto" aria-labelledby="howto-h">
    <h2 id="howto-h">How to read this</h2>
    <p><Basis kind="measured" /> Computed directly from the audio, like the length or the level.</p>
    <p><Basis kind="estimated" /> Inferred by the analyzer, like the key, the sections or the drum pattern. Listen to it, check it, and correct it if it is wrong.</p>
    <p><Basis kind="assumed" /> Not detected: the analyzer assumes it, like four beats per bar.</p>
    <p><Basis kind="unknown" /> The analyzer can't tell, and says so instead of guessing.</p>
    <p class="small"><b>How reliable is it?</b> Teardown has so far been checked only on computer-generated songs with known answers. It has not been measured on real recordings, so treat every estimate as something to verify by ear. It follows one tempo and four beats per bar, and relative keys (such as A minor and C major) are easily confused.</p>
  </section>

  <footer class="about-build">
    <details>
      <summary>About this build</summary>
      <dl class="about tt-mono" data-testid="build-info">
        <dt>Version</dt><dd>{BUILD.appVersion} ({BUILD.mode})</dd>
        <dt>Commit</dt><dd>{short(BUILD.gitSha)}{BUILD.gitDirty ? " + local changes" : ""}</dd>
        <dt>Engine</dt><dd>{BUILD.engineSha256.slice(0, 12)}</dd>
        <dt>TimeMap</dt><dd>{tm.schema}, {tm.fingerprint}</dd>
        <dt>Svelte</dt><dd>{BUILD.versions.svelte}</dd>
      </dl>
    </details>
  </footer>
</main>

<style>
  .top { display: flex; gap: 14px; align-items: center; }
  .top h1 { font-size: clamp(1.6rem, 4.5vw, 2.4rem); }
  .logo { flex: none; width: 44px; height: 44px; border-radius: var(--tt-radius-sm); background: var(--tt-accent); color: var(--tt-accent-ink); display: grid; place-items: center; font: 800 1rem var(--tt-font-display); }
  .lead { color: var(--tt-ink-2); max-width: 70ch; margin-top: 6px; }
  .about-build { display: flex; justify-content: flex-end; }
  .about-build summary { cursor: pointer; color: var(--tt-ink-3); font-size: var(--tt-fs-sm); }
  .about { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 8px 0 0; font-size: var(--tt-fs-xs); }
  .about dt { color: var(--tt-ink-3); }
  .about dd { margin: 0; overflow-wrap: anywhere; }
  #howto p { margin: 0; }
  #empty ul { margin: 0; padding-left: 20px; display: grid; gap: 6px; color: var(--tt-ink-2); }
</style>
