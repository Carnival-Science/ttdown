<script lang="ts">
  import Tabs from "../lib/ui/Tabs.svelte";
  // The six parts of a teardown, in the legacy order (index.html TD_TABS). Content arrives in M3.
  const PARTS = [
    { value: "overview", label: "Overview" },
    { value: "build", label: "Build it" },
    { value: "ideas", label: "Idea generator" },
    { value: "map", label: "Song map" },
    { value: "sound", label: "Sounds and mix" },
    { value: "compare", label: "Compare" },
  ] as const;
  let part = $state<string | null>("overview");
</script>

<header class="hero">
  <p class="eyebrow">Learn from the songs you love</p>
  <h1>Track Teardown</h1>
  <p class="tt-muted lead">Upload a reference track and see its tempo, key, drums, arrangement and mix, laid out so you can rebuild it.</p>
</header>

<section class="tt-panel" aria-labelledby="m1-note">
  <h2 id="m1-note">New workspace in progress</h2>
  <p class="tt-muted">This is the new application shell. Analysis is not connected here yet, so nothing can be uploaded. The current app keeps working as before.</p>
</section>

<Tabs items={PARTS} label="Parts of this teardown" bind:value={part}>
  {#snippet panel(item)}
    <section class="tt-panel" data-part={item.value}>
      <h2>{item.label}</h2>
      <p class="tt-small">Not migrated yet.</p>
    </section>
  {/snippet}
</Tabs>

<style>
  .hero { display: grid; gap: 10px; padding: 8px 0; }
  .eyebrow { font: 600 var(--tt-fs-xs) var(--tt-font-mono); color: var(--tt-lcd); text-transform: uppercase; letter-spacing: .08em; }
  .lead { max-width: 65ch; }
</style>
