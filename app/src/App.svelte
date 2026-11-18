<script lang="ts">
  import { onDestroy } from "svelte";
  import Popover from "./lib/ui/Popover.svelte";
  import { ROUTES } from "./lib/routing/routes";
  import { createRouter } from "./lib/routing/router.svelte";
  import { BUILD } from "./lib/build/identity";
  import { timeMapSelfCheck } from "./lib/timemap";
  import { installTestHooks } from "./lib/testing/hooks";
  import Teardown from "./routes/Teardown.svelte";
  import Learn from "./routes/Learn.svelte";
  import SampleLab from "./routes/SampleLab.svelte";
  import Journal from "./routes/Journal.svelte";

  const router = createRouter();
  onDestroy(() => router.destroy());
  installTestHooks({ route: () => router.current, navigate: id => router.navigate(id) });

  // Runs the canonical TimeMap once; the smoke test compares this with Node (dev server and built bundle alike).
  const tm = timeMapSelfCheck();
  const short = (s: string | null) => (s ? s.slice(0, 7) : "unknown");
  const VIEWS = { teardown: Teardown, learn: Learn, samples: SampleLab, journal: Journal } as const;
  const View = $derived(VIEWS[router.current]);
</script>

<div class="wrap" data-route={router.current} data-timemap-schema={tm.schema} data-timemap-fingerprint={tm.fingerprint}>
  <header class="console">
    <a class="brand" href="#teardown" aria-label="Track Teardown home">
      <span class="logo" aria-hidden="true">TT</span>
      <b>Track Teardown</b>
    </a>
    <nav class="nav" aria-label="Main">
      {#each ROUTES as r (r.id)}
        <a href={"#" + r.id} title={r.title} aria-current={router.current === r.id ? "page" : undefined}
           class:primary={r.id === "teardown"}>{r.label}</a>
      {/each}
    </nav>
    <Popover label="About this build" title="About this build">
      {#snippet trigger()}i{/snippet}
      <dl class="about tt-mono" data-testid="build-info">
        <dt>Version</dt><dd>{BUILD.appVersion} ({BUILD.mode})</dd>
        <dt>Commit</dt><dd>{short(BUILD.gitSha)}{BUILD.gitDirty ? " + local changes" : ""}</dd>
        <dt>TimeMap</dt><dd>{tm.schema}, {tm.fingerprint}</dd>
        <dt>Svelte</dt><dd>{BUILD.versions.svelte}</dd>
        <dt>UI SDK</dt><dd>{BUILD.versions.uiSdk}</dd>
      </dl>
    </Popover>
  </header>

  <main id="main">
    <View />
  </main>
</div>

<style>
  .wrap { max-width: var(--tt-max); margin: 0 auto; padding: 16px var(--tt-gutter) 96px; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--tt-gap); }
  main { display: grid; gap: var(--tt-gap); min-width: 0; }
  .console {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px 16px; align-items: center;
    background: linear-gradient(180deg, #24262d, #1a1c21); border: 1px solid var(--tt-line); border-radius: var(--tt-radius); padding: 10px 12px;
  }
  .brand { display: flex; gap: 10px; align-items: center; text-decoration: none; color: var(--tt-ink); min-height: var(--tt-tap); }
  .brand b { font: 800 0.95rem var(--tt-font-display); text-transform: uppercase; letter-spacing: .02em; white-space: nowrap; }
  .logo { width: 38px; height: 38px; border-radius: var(--tt-radius-sm); background: var(--tt-accent); color: var(--tt-accent-ink); display: grid; place-items: center; font: 800 0.95rem var(--tt-font-display); }
  .nav { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; min-width: 0; }
  .nav a {
    display: inline-flex; align-items: center; min-height: var(--tt-tap); padding: 0 14px; border-radius: var(--tt-radius-sm);
    font: 600 var(--tt-fs-sm) var(--tt-font-body); text-decoration: none; color: var(--tt-ink-2); background: #15161a; border: 1px solid var(--tt-line); white-space: nowrap;
  }
  .nav a[aria-current="page"] { color: var(--tt-ink); border-color: var(--tt-accent); }
  .nav a.primary { font-weight: 700; }
  .about { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: var(--tt-fs-xs); }
  .about dt { color: var(--tt-ink-3); }
  .about dd { margin: 0; overflow-wrap: anywhere; }
  /* Phone: brand and build button on the first row, navigation on its own full-width row. No clipping. */
  @media (max-width: 720px) {
    .console { grid-template-columns: minmax(0, 1fr) auto; }
    .nav { grid-column: 1 / -1; grid-row: 2; justify-content: stretch; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .nav a { justify-content: center; }
  }
</style>
