<!-- Track Teardown: the app shell. Header (brand, views, Display, Volume, LCD), the current view, the practice-session pill and the
     coach. Teardown is the default view (founder decision); Learn, Sample Lab and Journal are secondary. -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { ROUTES } from "./lib/routing/routes";
  import { createRouter } from "./lib/routing/router.svelte";
  import { installTestHooks } from "./lib/testing/hooks";
  import { app } from "./lib/state/app.svelte";
  import { account } from "./lib/storage/account.svelte";
  import { teardown } from "./lib/state/teardown.svelte";
  import { domain } from "./lib/domain";
  import { timeMapSelfCheck } from "./lib/timemap";
  import { BUILD } from "./lib/build/identity";
  import Popover from "./lib/ui/Popover.svelte";
  import Display from "./components/Display.svelte";
  import Volume from "./components/Volume.svelte";
  import Lcd from "./components/Lcd.svelte";
  import Session from "./components/Session.svelte";
  import Coach from "./components/Coach.svelte";
  import Teardown from "./routes/Teardown.svelte";
  import Learn from "./routes/Learn.svelte";
  import SampleLab from "./routes/SampleLab.svelte";
  import Journal from "./routes/Journal.svelte";

  const router = createRouter();
  onDestroy(() => router.destroy());
  $effect(() => { app.route = router.current; });
  installTestHooks({ route: () => router.current, navigate: id => router.navigate(id) });
  void account.init(domain.tdId);
  $effect(() => { void account.rev; void account.state; teardown.refreshHistory(); });

  const tm = timeMapSelfCheck();
  const short = (s: string | null) => (s ? s.slice(0, 7) : "unknown");
  const TITLES: Record<string, string> = { teardown: "Teardown a song", learn: "Learn FL Studio", samples: "Sort and tag your samples", journal: "Practice journal" };

  // the sticky header measures itself, so nothing slides under it; it compacts after scrolling
  let hdr: HTMLElement;
  $effect(() => {
    const setH = () => document.documentElement.style.setProperty("--hdr", (hdr.offsetHeight + 8) + "px");
    const ro = new ResizeObserver(setH); ro.observe(hdr, { box: "border-box" }); setH();
    let lastY = 0; const onScroll = () => { const y = window.scrollY; if ((y > 120) !== (lastY > 120)) { document.body.classList.toggle("compact-hdr", y > 120); requestAnimationFrame(setH); } lastY = y; };
    window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", setH);
    return () => { ro.disconnect(); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", setH); };
  });
  $effect(() => { document.body.classList.toggle("has-song", !teardown.example); });
</script>

<main class="wrap" data-route={router.current} data-timemap-schema={tm.schema} data-timemap-fingerprint={tm.fingerprint}>
  <header class="console" bind:this={hdr}>
    <a class="brand" href="#teardown" aria-label="Track Teardown home" style="text-decoration:none;color:inherit">
      <span class="logo" aria-hidden="true">TT</span><div><b>Track Teardown</b><span>FL Studio learning rig</span></div>
    </a>
    <nav class="tabs" aria-label="Sections">
      {#each ROUTES as r (r.id)}
        <a href={"#" + r.id} id={"tab-" + r.id} title={TITLES[r.id]} aria-current={router.current === r.id ? "page" : undefined}>{r.label}</a>
      {/each}
    </nav>
    <Display />
    <Volume />
    <Lcd />
  </header>

  <div id="view-teardown" style="display:grid;gap:18px" hidden={router.current !== "teardown"}><Teardown /></div>
  {#if router.current === "learn"}<div id="view-learn" style="display:grid;gap:18px"><Learn /></div>{/if}
  {#if router.current === "samples"}<div id="view-samples" style="display:grid;gap:18px"><SampleLab /></div>{/if}
  {#if router.current === "journal"}<div id="view-journal" style="display:grid;gap:18px"><Journal /></div>{/if}

  <footer class="about-build">
    <Popover label="About this build" title="About this build">
      {#snippet trigger()}About this build{/snippet}
      <dl class="about tt-mono" data-testid="build-info">
        <dt>Version</dt><dd>{BUILD.appVersion} ({BUILD.mode})</dd>
        <dt>Commit</dt><dd>{short(BUILD.gitSha)}{BUILD.gitDirty ? " + local changes" : ""}</dd>
        <dt>Engine</dt><dd>{BUILD.engineSha256.slice(0, 12)}</dd>
        <dt>TimeMap</dt><dd>{tm.schema}, {tm.fingerprint}</dd>
        <dt>Svelte</dt><dd>{BUILD.versions.svelte}</dd>
        <dt>UI SDK</dt><dd>{BUILD.versions.uiSdk}</dd>
      </dl>
    </Popover>
  </footer>
</main>
<Session />
<Coach />

<style>
  .about-build { display: flex; justify-content: flex-end; }
  .about { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: var(--tt-fs-xs); }
  .about dt { color: var(--tt-ink-3); }
  .about dd { margin: 0; overflow-wrap: anywhere; }
</style>
