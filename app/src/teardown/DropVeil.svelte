<!-- Shown while a file is dragged over the window: the page dims to paper, a fine cobalt frame marks the whole window as the drop target,
     and the brand's three discs follow the pointer (trailing it slightly), gathering in as the drag starts, with "Drop to analyse" under
     them. Decorative (aria-hidden) and pointer-transparent; under prefers-reduced-motion the discs sit at the pointer without easing. -->
<script lang="ts">
  let { x, y }: { x: number; y: number } = $props();
  const uid = Math.random().toString(36).slice(2, 8);
</script>

<div class="dropveil" aria-hidden="true">
  <div class="frame"></div>
  <div class="cursor" style:translate={`${x}px ${y}px`}>
    <svg class="cluster" viewBox="-60 -60 120 120" focusable="false">
      <defs>
        <pattern id={"vdots" + uid} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="1.5" cy="1.5" r="1.1" fill="#F7F8F2" /></pattern>
        <mask id={"vscreen" + uid}><rect x="-60" y="-60" width="120" height="120" fill="white" /><rect x="-60" y="-60" width="120" height="120" fill={`url(#vdots${uid})`} opacity="0.6" /></mask>
      </defs>
      <g mask={`url(#vscreen${uid})`}>
        <circle class="d d1" cx="-10" cy="-2" r="30" fill="#9FCB6E" />
        <circle class="d d2" cx="14" cy="-10" r="26" fill="#8CC2A4" />
        <circle class="d d3" cx="6" cy="16" r="22" fill="#79AD84" />
      </g>
      <circle class="ring" r="46" />
    </svg>
    <p>Drop to analyse</p>
  </div>
</div>

<style>
  .dropveil { position: fixed; inset: 0; z-index: 50; pointer-events: none; background: rgb(247 248 242 / .94); animation: veil-in 160ms ease-out; }
  .frame { position: absolute; inset: 12px; border: 1.5px solid var(--tt-cobalt); }
  .cursor { position: absolute; left: 0; top: 0; width: 0; height: 0; transition: translate 220ms cubic-bezier(.23, 1, .32, 1); will-change: translate; }
  .cluster { position: absolute; left: -60px; top: -60px; width: 120px; height: 120px; overflow: visible; }
  .d { mix-blend-mode: multiply; opacity: .85; transform-box: fill-box; transform-origin: center; animation: gather 520ms cubic-bezier(.23, 1, .32, 1) both; }
  .d1 { --fx: -18px; --fy: 6px; } .d2 { --fx: 18px; --fy: -14px; } .d3 { --fx: 8px; --fy: 20px; }
  .ring { fill: none; stroke: var(--tt-cobalt); stroke-width: 1; stroke-dasharray: 2 4; opacity: .7; transform-box: fill-box; transform-origin: center; animation: ring-in 520ms cubic-bezier(.23, 1, .32, 1) both, spin 14s linear infinite; }
  p { position: absolute; left: 0; top: 64px; translate: -50% 0; margin: 0; white-space: nowrap; color: var(--tt-ink); font: 800 1.15rem/1 var(--tt-font-display); font-stretch: 80%; }
  @keyframes veil-in { from { opacity: 0; } }
  @keyframes gather { from { translate: var(--fx) var(--fy); scale: 1.25; opacity: 0; } }
  @keyframes ring-in { from { scale: .6; opacity: 0; } }
  @keyframes spin { to { rotate: 360deg; } }
  @media (prefers-reduced-motion: reduce) { .dropveil, .d, .ring { animation: none; } .cursor { transition: none; } }
</style>
