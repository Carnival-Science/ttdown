<!-- Teardown's identity art: overlapping translucent lime and sea-green discs with a halftone dot screen, after early-2000s print and
     web work. Purely decorative (aria-hidden); it never sits on top of anything interactive.
       mode "idle"     the discs drift, slowly
       mode "converge" a file is being dragged in: the discs gather towards the middle
       mode "analyse"  wireframe rings around the gathered discs, one per analysis stage, each separating outwards as its stage finishes
     Motion stops entirely under prefers-reduced-motion (the art is still drawn). -->
<script lang="ts">
  let { mode = "idle", progress = 0, stages = [12, 30, 50, 70, 86, 100], class: cls = "" }: { mode?: "idle" | "converge" | "analyse"; progress?: number; stages?: number[]; class?: string } = $props();
  const uid = Math.random().toString(36).slice(2, 8);
  // discs: centre (x, y), radius, fill, drift (dx, dy, seconds)
  const DISCS = [
    { x: 330, y: 250, r: 190, c: "#9FCB6E", d: [14, -10, 19] }, { x: 470, y: 210, r: 170, c: "#8CC2A4", d: [-12, 12, 23] },
    { x: 420, y: 360, r: 200, c: "#B4D58A", d: [10, 14, 21] },  { x: 250, y: 390, r: 150, c: "#7DB79A", d: [-14, -8, 17] },
    { x: 560, y: 380, r: 160, c: "#C6E09F", d: [12, -12, 25] }, { x: 380, y: 300, r: 120, c: "#79AD84", d: [-8, 10, 15] },
  ];
  const CX = 400, CY = 300;
  const done = $derived(stages.map(s => progress >= s));
</script>

<svg class={"circles " + mode + " " + cls} viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
  <defs>
    <pattern id={"dots" + uid} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2" cy="2" r="1.5" fill="#F7F8F2" /></pattern>
    <mask id={"screen" + uid}><rect width="800" height="600" fill="white" /><rect width="800" height="600" fill={`url(#dots${uid})`} opacity="0.75" /></mask>
  </defs>
  <g class="discs" mask={`url(#screen${uid})`}>
    {#each DISCS as d, i (i)}
      <circle class="disc" cx={d.x} cy={d.y} r={d.r} fill={d.c} style:--dx={`${d.d[0]}px`} style:--dy={`${d.d[1]}px`} style:--t={`${d.d[2]}s`} style:--tx={`${(CX - d.x) * 0.72}px`} style:--ty={`${(CY - d.y) * 0.72}px`} style:--i={i} />
    {/each}
  </g>
  {#if mode === "analyse"}
    <g class="rings">
      {#each stages as s, k (s)}<circle class="ring" class:done={done[k]} cx={CX} cy={CY} r="136" style:r={`${done[k] ? 150 + k * 26 : 136}px`} style:--k={k} />{/each}
    </g>
  {/if}
</svg>

<style>
  .circles { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; }
  .disc { mix-blend-mode: multiply; opacity: .5; transform-box: fill-box; transform-origin: center;
    animation: drift var(--t) ease-in-out calc(var(--i) * -2s) infinite alternate; transition: transform 700ms cubic-bezier(.23, 1, .32, 1), opacity 500ms ease; }
  @keyframes drift { from { translate: 0 0; } to { translate: var(--dx) var(--dy); } }
  .converge .disc, .analyse .disc { transform: translate(var(--tx), var(--ty)) scale(.62); }
  .converge .disc { opacity: .42; }
  .analyse .disc { opacity: .32; }
  .ring { fill: none; stroke: #1B211D; stroke-width: 1; opacity: .18; transition: r 900ms cubic-bezier(.23, 1, .32, 1), opacity 600ms ease; }
  .ring.done { opacity: .55; }
  .analyse .rings { animation: spin 40s linear infinite; transform-origin: 400px 300px; }
  .ring:nth-child(odd) { stroke-dasharray: 2 5; }
  @keyframes spin { to { rotate: 360deg; } }
  @media (prefers-reduced-motion: reduce) { .disc, .analyse .rings { animation: none; } .disc, .ring { transition: none; } }
</style>
