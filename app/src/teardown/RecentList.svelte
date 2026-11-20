<!-- The saved teardowns (the toolbar's Recent menu). A fixed header (what this is, how many, Clear all) over a list that scrolls on its own,
     so Clear all is never scrolled away. Each saved teardown is one flat row: its title, and tempo, key and length underneath; the one on
     screen is marked. Delete sits in its own column, which the list's reserved scrollbar gutter never covers; it is quiet until the row is
     hovered or focused (always plain on touch screens). Deleting cannot be undone, so the row itself turns into the question
     ("Delete “…”? Delete / Cancel"); Clear all does the same in the header. Both say it only removes the copy saved in this browser.
     Motion: rows press in a touch (0.98); a row swapping to its question crossfades with a slight blur (150 ms). No stagger: this menu
     opens many times a day. Hooks kept for tests and the legacy contract: #hist, .h-open, [data-delete], [data-delete-yes/cancel],
     [data-clear-all/yes/cancel], and #hist holds only the rows' own buttons. -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  let { limit = 99, onopen, clearAll = false }: { limit?: number; onopen?: () => void; clearAll?: boolean } = $props();
  /** Which row (index) is asking "Delete?", or "all" for Clear all. */
  let asking = $state<number | "all" | null>(null);
  const label = (h: { title?: string }) => h.title || "Untitled";
  const rows = $derived(teardown.history.slice(0, limit));
  const total = $derived(teardown.history.length);
  $effect(() => { if (asking !== null && asking !== "all" && asking >= rows.length) asking = null; });
  const mmss = (s: number) => { if (!(s > 0)) return ""; const m = Math.floor(s / 60), r = Math.round(s % 60); return `${m}:${String(r).padStart(2, "0")}`; };
  const meta = (h: any) => [h.bpm ? `${Math.round(h.bpm)} BPM` : "", h.key || "", mmss(h.duration)].filter(Boolean).join(" · ");
  const isOpen = (h: any) => { const r = teardown.result as any; return !!r && r.title === h.title && r.duration === h.duration; };
</script>

{#if clearAll}
  <div class="head" class:asking={asking === "all"}>
    {#if asking === "all"}
      <div class="swap" role="alert">
        <p class="q">Delete all {total} saved teardowns? This can't be undone. It only removes the copies saved in this browser.</p>
        <span class="acts">
          <button type="button" class="btn sm danger" data-clear-yes onclick={() => { asking = null; teardown.forgetAll(); }}>Delete all</button>
          <button type="button" class="btn sm" data-clear-cancel onclick={() => (asking = null)}>Cancel</button>
        </span>
      </div>
    {:else}
      <p class="title"><b>Recent</b> <span class="sub">{total} saved in this browser</span></p>
      <button type="button" class="link" data-clear-all onclick={() => (asking = "all")}>Clear all</button>
    {/if}
  </div>
{/if}

<div class="rl" id={clearAll ? "hist" : undefined}>
  {#each rows as h, i (i)}
    <div class="hrow" class:asking={asking === i} class:current={isOpen(h)} data-hrow>
      {#if asking === i}
        <div class="swap ask" role="group" aria-label={"Delete " + label(h) + "?"}>
          <p class="q">Delete “{label(h)}”?</p>
          <span class="acts">
            <button type="button" class="btn sm danger" data-delete-yes onclick={() => { asking = null; teardown.forget(h); }}>Delete</button>
            <button type="button" class="btn sm" data-delete-cancel onclick={() => (asking = null)}>Cancel</button>
          </span>
        </div>
      {:else}
        <button type="button" class="h-open" title={`${label(h)} · ${meta(h)}`} aria-current={isOpen(h) ? "true" : undefined} onclick={() => { teardown.open(h); onopen?.(); }}>
          <span class="t">{label(h)}</span>
          <span class="m">{meta(h)}</span>
        </button>
        <button type="button" class="x" data-delete aria-label={"Delete " + label(h)} title={"Delete " + label(h)} onclick={() => (asking = i)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>
        </button>
      {/if}
    </div>
  {/each}
</div>
{#if clearAll && asking !== "all"}<p class="foot">Deleting only removes the copy saved in this browser.</p>{/if}

<style>
  /* header: fixed above the scrolling list */
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 2px 4px 10px; border-bottom: 1px solid var(--tt-line); }
  .head.asking { display: block; }
  .title { margin: 0; font-size: var(--tt-fs-sm); color: var(--tt-ink); }
  .title b { font-weight: 600; }
  .sub { color: var(--tt-ink-3); margin-left: 4px; }
  .link { border: 0; background: none; padding: 2px 0; font: 500 var(--tt-fs-sm) var(--tt-font-body); color: var(--tt-ink-3); cursor: pointer; text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 3px; transition: color 150ms ease, text-decoration-color 150ms ease; }
  .link:hover, .link:focus-visible { color: var(--tt-bad); text-decoration-color: currentColor; }

  /* the list scrolls on its own; the gutter is reserved so nothing (the delete column) ever sits under the scrollbar */
  .rl { display: grid; max-height: min(420px, 56dvh); overflow-y: auto; scrollbar-gutter: stable; overscroll-behavior: contain; padding: 4px 0; margin-right: -4px; }
  .hrow { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 32px; align-items: center; gap: 2px; border-radius: 2px; min-height: 48px; }
  .hrow + .hrow::before { content: ""; position: absolute; left: 10px; right: 36px; top: 0; border-top: 1px solid var(--tt-line); }
  .hrow:hover::before, .hrow:hover + .hrow::before, .hrow:focus-within::before, .hrow:focus-within + .hrow::before { border-color: transparent; }

  .h-open {
    display: grid; gap: 2px; min-width: 0; padding: 8px 10px; border: 0; border-radius: 2px; background: transparent; color: var(--tt-ink); text-align: left; cursor: pointer;
    font: inherit; transition: background-color 150ms ease, transform 120ms cubic-bezier(.23, 1, .32, 1);
  }
  .h-open:active { transform: scale(0.98); }
  .h-open:focus-visible { outline: 2px solid var(--tt-focus); outline-offset: -2px; }
  .t { font: 500 .9rem/1.3 var(--tt-font-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m { font: 400 .74rem/1.3 var(--tt-font-mono); color: var(--tt-ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* the teardown on screen: a cobalt dot before its title */
  .current .t::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--tt-cobalt); margin-right: 8px; vertical-align: 2px; }

  .x { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 2px; background: transparent; color: var(--tt-ink-3); cursor: pointer;
    transition: color 150ms ease, background-color 150ms ease, opacity 150ms ease, transform 120ms cubic-bezier(.23, 1, .32, 1); }
  .x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .x:active { transform: scale(0.94); }
  .x:focus-visible { outline: 2px solid var(--tt-focus); outline-offset: -2px; opacity: 1; color: var(--tt-bad); }
  @media (hover: hover) and (pointer: fine) {
    .hrow:hover .h-open { background: color-mix(in srgb, var(--tt-ink) 5%, transparent); }
    .x { opacity: .35; }
    .hrow:hover .x, .hrow:focus-within .x { opacity: 1; }
    .x:hover { color: var(--tt-bad); background: color-mix(in srgb, var(--tt-bad) 8%, transparent); }
  }

  /* a row (or the header) swapping to its question: a quick crossfade with a touch of blur, so it reads as one thing changing */
  .swap { display: grid; gap: 8px; padding: 8px 10px; animation: swap-in 150ms cubic-bezier(.23, 1, .32, 1); }
  .hrow.asking { grid-template-columns: minmax(0, 1fr); background: color-mix(in srgb, var(--tt-bad) 6%, transparent); }
  .head .swap { padding: 0 0 2px; }
  .q { margin: 0; font-size: var(--tt-fs-sm); color: var(--tt-ink); overflow-wrap: anywhere; }
  .acts { display: flex; gap: 6px; }
  .btn.sm { min-height: 30px; padding: 0 12px; font-size: .82rem; }
  .btn.sm:active { transform: scale(0.97); }
  .danger { background: var(--tt-bad); color: #fff; border-color: var(--tt-bad); font-weight: 600; }
  .danger:hover { background: color-mix(in srgb, var(--tt-bad) 88%, black); }
  @keyframes swap-in { from { opacity: 0; filter: blur(2px); } }

  .foot { margin: 0; padding: 8px 4px 0; border-top: 1px solid var(--tt-line); font-size: var(--tt-fs-xs); color: var(--tt-ink-3); }
  /* fingers: a full-size delete target */
  @media (pointer: coarse) { .hrow { grid-template-columns: minmax(0, 1fr) 44px; min-height: 56px; } .x { width: 44px; height: 44px; } .hrow + .hrow::before { right: 48px; } }
  @media (prefers-reduced-motion: reduce) { .swap { animation: none; } .h-open, .x { transition: color 150ms ease, background-color 150ms ease, opacity 150ms ease; } .h-open:active, .x:active { transform: none; } }
</style>
