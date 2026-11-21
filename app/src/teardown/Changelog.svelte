<!-- The version number, in the toolbar, and the changelog it opens (CHANGELOG.md). -->
<script lang="ts">
  import { BUILD } from "../lib/build/identity";
  import { RELEASES } from "../lib/build/changelog";
  import Dialog from "../lib/ui/Dialog.svelte";
  let open = $state(false);
  const version = BUILD.appVersion;
</script>

<button type="button" class="btn version" id="version" aria-haspopup="dialog" title="What changed in this version" onclick={() => (open = true)}>v{version}</button>
<Dialog bind:open title="Changelog" subtitle={`You are on v${version}`}>
  <div class="changelog" data-changelog>
    {#each RELEASES as r (r.version)}
      <section class="release" data-version={r.version}>
        <div class="rhead"><h3 class={"rv" + (r.version === version ? " current" : "")}>v{r.version}</h3><time class="rdate" datetime={r.date}>{r.date}</time></div>
        {#if r.intro}<p class="rintro">{r.intro}</p>{/if}
        {#each r.sections as s (s.title)}
          <h4 class="rsec">{s.title}</h4>
          <ul class="ritems">{#each s.items as it}<li>{it}</li>{/each}</ul>
        {/each}
      </section>
    {/each}
  </div>
</Dialog>

<style>
  .version { flex: none; padding: 0 8px; font-family: var(--tt-font-mono, monospace); font-size: var(--tt-fs-xs); color: var(--tt-ink-3); }
  .version:hover, .version:focus-visible { color: var(--tt-ink); }
  .changelog { display: grid; gap: 24px; }
  .rhead { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .rv { margin: 0; font: 400 1.6rem var(--tt-font-display); color: var(--tt-ink); }
  .rv.current { color: var(--tt-accent); }
  .rdate { color: var(--tt-ink-3); font-size: var(--tt-fs-sm); }
  .rintro { margin: 8px 0 0; color: var(--tt-ink-2); }
  .rsec { margin: 20px 0 8px; font: 400 var(--tt-fs-sm) var(--tt-font-display); color: var(--tt-ink-3); text-transform: none; }
  .ritems { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
  .ritems li { position: relative; padding-left: 16px; color: var(--tt-ink-2); }
  .ritems li::before { content: "-"; position: absolute; left: 0; color: var(--tt-ink-3); }
</style>
