<!-- Display settings: text size, spacing, accent colour, sticky top bar (legacy #dispbtn, saved under display_v1). -->
<script lang="ts">
  import Popover from "../lib/ui/Popover.svelte";
  import { KEYS, lsGet, lsSet } from "../lib/storage/local";
  type D = { size: string; density: string; accent: string; sticky: boolean };
  const ACCENTS: [string, string, string][] = [["Orange", "#ff7a1a", "#ffb547"], ["Blue", "#4d8dff", "#8fb8ff"], ["Green", "#3ccf7a", "#8ae6b0"], ["Pink", "#ff4fa3", "#ff9bcb"], ["Purple", "#9b6bff", "#c4a8ff"]];
  const d = $state<D>(Object.assign({ size: "m", density: "comfy", accent: "#ff7a1a", sticky: true }, lsGet<Partial<D>>(KEYS.display, {})));
  $effect(() => {
    const r = document.documentElement.style, ac = ACCENTS.find(x => x[1] === d.accent) || ACCENTS[0]!;
    r.setProperty("--tt-fs", ({ s: "15px", m: "16px", l: "18px" } as Record<string, string>)[d.size] || "16px"); r.setProperty("--tt-accent", ac[1]); r.setProperty("--tt-lcd", ac[2]);
    document.body.classList.toggle("density-compact", d.density === "compact"); document.body.classList.toggle("no-sticky", !d.sticky);
    lsSet(KEYS.display, { ...d });
  });
  const groups: [string, keyof D, [string, string | boolean, string?][]][] = [
    ["Text size", "size", [["Small", "s"], ["Medium", "m"], ["Large", "l"]]],
    ["Spacing", "density", [["Comfortable", "comfy"], ["Compact", "compact"]]],
    ["Accent color", "accent", ACCENTS.map(([n, c]) => [n, c, c])],
    ["Top bar", "sticky", [["Stays on screen", true], ["Scrolls away", false]]],
  ];
</script>

<div class="dispwrap">
  <Popover label="Display settings" title="Display" triggerId="dispbtn" triggerClass="volbtn" contentClass="tt-pop disppop" showTitle={false}>
    {#snippet trigger()}🎨{/snippet}
    {#each groups as [label, key, opts] (key)}
      <div><div class="lbl">{label}</div><div class="opts">
        {#each opts as [t, v, sw] (t)}
          {#if sw}<button type="button" class="sw" title={t} aria-label={t} style:background={sw} aria-pressed={(d[key] === v)} onclick={() => { (d as Record<string, unknown>)[key] = v; }}></button>
          {:else}<button type="button" aria-pressed={(d[key] === v)} onclick={() => { (d as Record<string, unknown>)[key] = v; }}>{t}</button>{/if}
        {/each}
      </div></div>
    {/each}
    <small class="small">Saved on this device.</small>
  </Popover>
</div>
