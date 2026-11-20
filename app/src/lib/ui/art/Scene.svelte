<!-- Teardown's identity: ONE set of three overlapping discs, mounted once for the whole session. Application states are told apart by
     depth of field, not by different pictures:
       idle      three large discs in a loose triad, slightly out of focus (each silhouette still readable), each wobbling on its own small
                 orbit; hovering the motif (it opens a file) draws them a little closer
       analyse   the same discs, busier, as if working
       drop      a file is dragged over the window: the discs come forward into sharp focus, gather, follow the pointer (each trailing
                 at its own pace) and jostle against each other; dragging away reverses it
       workspace the analysis is done: the discs grow, defocus heavily and settle as a wash of lime and sage behind the work, then stop
     Decorative (aria-hidden) and never takes a pointer event. Only the discs are blurred; each disc is its own layer, so moving it does not
     recompute its blur. The animation loop runs only while something moves: once the workspace wash settles it stops, so nothing animates
     behind playback or transcription. Under prefers-reduced-motion the discs are placed, not animated. -->
<script lang="ts" module>
  export type SceneState = "idle" | "analyse" | "drop" | "workspace";
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { LINES, Cycle } from "./lines.svelte";

  let { state: mode = "idle", x = 0, y = 0, lean = false }: { state?: SceneState; x?: number; y?: number; lean?: boolean } = $props();

  // each disc: colour, relative size, its place in the triad (bx, by, in units of R), its own small orbit around that place (amplitudes in
  // R, frequencies in Hz, phase), how quickly it follows (0..1 per frame), and where it settles in the workspace wash (share of the window, scale)
  const DISCS = [
    { c: "#9FC6B2", size: 0.98, bx: -0.36, by: -0.30, ax: 0.10, ay: 0.08, fx: 0.050, fy: 0.071, ph: 0.0, k: 0.085, wx: -0.30, wy: -0.24, ws: 2.1 },
    { c: "#B6D690", size: 1.0, bx: 0.38, by: -0.18, ax: 0.09, ay: 0.11, fx: 0.064, fy: 0.043, ph: 2.1, k: 0.060, wx: 0.34, wy: -0.06, ws: 1.9 },
    { c: "#8DB597", size: 0.94, bx: -0.08, by: 0.36, ax: 0.11, ay: 0.09, fx: 0.039, fy: 0.058, ph: 4.2, k: 0.042, wx: 0.02, wy: 0.38, ws: 2.0 },
  ];
  const MOTION = { idle: { speed: 1, spread: 1 }, analyse: { speed: 3, spread: 0.9 }, drop: { speed: 1.6, spread: 0.6 }, workspace: { speed: 0.4, spread: 1 } };

  let els: HTMLDivElement[] = [];
  let ring: SVGGElement, dot: SVGCircleElement, say = $state<HTMLDivElement | undefined>();
  // while a file is dragged in, the line rides in the discs' overlap (their centroid), so it is always on them, never on bare paper
  const dropLine = new Cycle(LINES.drop, 1800);
  let vw = $state(1200), vh = $state(800), R = $state(150);
  // live positions (px, centre of each disc), scales and the cluster centre; plain numbers, written to the DOM directly each frame
  const P = DISCS.map(() => ({ x: 0, y: 0, s: 1 }));
  const C = { x: 0, y: 0 };
  let theta = 0, raf = 0, last = 0, placed = false, washSince = 0;
  // the wash gets this long to arrive; then the discs are put in their final place and the loop stops for good
  const WASH_MS = 2200;

  const reduce = () => typeof window === "undefined" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // the middle of the stage (below the toolbar), where the discs live before a track is analysed
  function home() {
    const out = document.getElementById("out"), r = out?.getBoundingClientRect();
    return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + Math.min(r.height, vh - r.top) / 2 } : { x: vw / 2, y: vh / 2 };
  }
  function centreFor(s: SceneState) { return s === "drop" ? { x, y } : s === "workspace" ? { x: vw / 2, y: vh / 2 } : home(); }
  function targets(s: SceneState) {
    const c = s === "drop" ? C : centreFor(s), m = MOTION[s];
    return DISCS.map((d, i) => {
      if (s === "workspace") return { x: vw / 2 + d.wx * vw, y: vh / 2 + d.wy * vh, s: d.ws };
      const sp = m.spread * (lean && s === "idle" ? 0.9 : 1), wob = s === "analyse" ? 1.6 : 1;
      return { x: c.x + R * (d.bx * sp + wob * d.ax * Math.cos(theta * d.fx * 6.283 + d.ph)), y: c.y + R * (d.by * sp + wob * d.ay * Math.sin(theta * d.fy * 6.283 + d.ph * 1.3)), s: s === "drop" ? 0.62 : 1, i };
    });
  }
  function draw() {
    for (let i = 0; i < DISCS.length; i++) { const el = els[i]; if (!el) continue; const r = R * DISCS[i]!.size; el.style.transform = `translate3d(${P[i]!.x - r}px, ${P[i]!.y - r}px, 0) scale(${P[i]!.s})`; }
    if (ring) ring.setAttribute("transform", `translate(${C.x} ${C.y}) rotate(-18)`);
    if (say) { const cx = (P[0]!.x + P[1]!.x + P[2]!.x) / 3, cy = (P[0]!.y + P[1]!.y + P[2]!.y) / 3; say.style.transform = `translate3d(${cx}px, ${cy}px, 0)`; }
    if (dot) { const a = theta * 0.9; dot.setAttribute("cx", String(1.25 * R * Math.cos(a))); dot.setAttribute("cy", String(0.9 * R * Math.sin(a))); }
  }
  function snap(s: SceneState) { const c = centreFor(s); C.x = c.x; C.y = c.y; targets(s).forEach((t, i) => { P[i]!.x = t.x; P[i]!.y = t.y; P[i]!.s = t.s; }); draw(); }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    const s = mode, f = dt * 60;
    theta += dt * MOTION[s].speed;
    // the cluster centre eases towards its place (the pointer while dragging)
    const c = centreFor(s), kc = s === "drop" ? 0.16 : 0.06;
    C.x += (c.x - C.x) * Math.min(1, kc * f); C.y += (c.y - C.y) * Math.min(1, kc * f);
    const T = targets(s); let moving = false;
    for (let i = 0; i < P.length; i++) {
      const k = Math.min(1, (s === "workspace" ? 0.05 : DISCS[i]!.k * (s === "drop" ? 1.8 : 1)) * f);
      const dx = T[i]!.x - P[i]!.x, dy = T[i]!.y - P[i]!.y, ds = T[i]!.s - P[i]!.s;
      P[i]!.x += dx * k; P[i]!.y += dy * k; P[i]!.s += ds * Math.min(1, 0.05 * f);
      if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4 || Math.abs(ds) > 0.003) moving = true;
    }
    // gathered discs push each other apart a little, so they jostle instead of passing through one another
    if (s === "drop" || s === "analyse") for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const dx = P[j]!.x - P[i]!.x, dy = P[j]!.y - P[i]!.y, d = Math.hypot(dx, dy) || 1, min = R * (DISCS[i]!.size + DISCS[j]!.size) * 0.42;
      if (d < min) { const push = (min - d) * 0.04 * f, ux = dx / d, uy = dy / d; P[i]!.x -= ux * push; P[i]!.y -= uy * push; P[j]!.x += ux * push; P[j]!.y += uy * push; }
    }
    draw();
    // the workspace wash settles and then stays still: no animation behind the work
    if (s === "workspace") { if (!washSince) washSince = now; if (now - washSince >= WASH_MS) moving = false; } else washSince = 0;
    if (s !== "workspace" || (moving && now - washSince < WASH_MS)) raf = requestAnimationFrame(frame);
    else { snap(s); last = 0; }
  }
  const wake = () => { if (!raf && !reduce()) { last = 0; raf = requestAnimationFrame(frame); } };

  $effect(() => {
    const size = () => { vw = innerWidth; vh = innerHeight; R = Math.max(120, Math.min(340, Math.min(vw * 0.21, vh * 0.33))); };
    size();
    const onResize = () => { size(); if (reduce()) snap(untrack(() => mode)); else wake(); };
    addEventListener("resize", onResize);
    return () => { removeEventListener("resize", onResize); if (raf) cancelAnimationFrame(raf); raf = 0; };
  });
  // a state change, the pointer moving or the progress changing: place the discs (reduced motion) or let the loop carry them there
  $effect(() => {
    const s = mode; void x; void y; void lean; void R;
    untrack(() => { if (!placed) { placed = true; snap(s); } if (reduce()) snap(s); else { draw(); wake(); } });
  });
</script>

<div class="scene" data-state={mode} aria-hidden="true">
  {#each DISCS as d, i (i)}
    <div class="disc" bind:this={els[i]} style:width={`${2 * R * d.size}px`} style:height={`${2 * R * d.size}px`} style:background={d.c}></div>
  {/each}
  <svg class="orbit" width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`} focusable="false">
    <g bind:this={ring}>
      <ellipse rx={1.25 * R} ry={0.9 * R} />
      <circle class="dot" r="4" bind:this={dot} />
    </g>
  </svg>
  {#if mode === "drop"}<div class="say" bind:this={say}>{#key dropLine.line}<p class="tt-line">{dropLine.line}</p>{/key}</div>{/if}
</div>

<style>
  .scene { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
  /* while a file is dragged in, the discs come in front of the dimmed page (the veil, z-index 50) */
  .scene[data-state="drop"] { z-index: 60; }
  .disc {
    position: absolute; left: 0; top: 0; border-radius: 50%; mix-blend-mode: multiply; will-change: transform; transform-origin: center;
    opacity: .82; filter: blur(6px);
    transition: filter 900ms cubic-bezier(.23, 1, .32, 1), opacity 900ms cubic-bezier(.23, 1, .32, 1);
  }
  .scene[data-state="analyse"] .disc { filter: blur(8px); }
  .scene[data-state="drop"] .disc { opacity: .82; filter: blur(0); transition-duration: 380ms; }
  /* the wash: the blur is applied before the disc's scale (~2x) */
  .scene[data-state="workspace"] .disc { opacity: .55; filter: blur(40px); transition-duration: 1100ms; }
  .orbit { position: absolute; inset: 0; overflow: visible; opacity: 0; transition: opacity 500ms ease; }
  .orbit ellipse { fill: none; stroke: var(--tt-ink); stroke-width: 1; stroke-dasharray: 3 6; opacity: .45; }
  .orbit .dot { fill: var(--tt-ink); }
  /* only while a file is dragged in: the orbit marks the discs as a target */
  .scene[data-state="drop"] .orbit { opacity: 1; }
  .scene[data-state="drop"] .orbit ellipse { stroke: var(--tt-cobalt); opacity: .7; }
  .scene[data-state="drop"] .orbit .dot { fill: var(--tt-cobalt); }
  .say { position: absolute; left: 0; top: 0; width: 0; height: 0; display: grid; place-items: center; will-change: transform; }
  .say .tt-line { position: absolute; width: max-content; font-size: clamp(2rem, 5.4vmin, 4rem); }
  @media (prefers-reduced-motion: reduce) { .disc, .orbit { transition: none; } }
</style>
