// A shader sweep that reveals new content: a WebGL band (glimm's framework-agnostic core, MIT) crosses the window from left to right
// and the target element is uncovered behind it, so a finished analysis "develops" onto the page instead of popping in.
//
// The content is in the DOM and usable the whole time: the band is a decorative, pointer-transparent overlay and the reveal is a
// clip-path on the target, removed when the sweep ends. Skipped entirely (the content just appears) under prefers-reduced-motion,
// without WebGL, or when another sweep is already running. Nothing here knows about Svelte.
import { accentChain, createShader, playSweep, type ShaderController, type SweepHandle } from "glimm";

/** The discs' own lime and sage: the band reads as the circles washing across into the workspace (Scene's "workspace" state runs at the
 *  same time and pace), one gesture rather than two competing transitions. */
const PALETTE = accentChain(["#A9CF7A", "#C9DDB0", "#8FC3A6"]);
const SWEEP_MS = 900;
/** glimm travels a full-window band from -0.2 to 1.2 of the width (its overscan for a full-bleed canvas). */
const OVERSCAN = 0.2;

declare const __TEST_HOOKS__: boolean;
/** The bench build (benchmark and browser tests) sweeps only when a test asks with `window.__ttSweep = true`: reading back a WebGL canvas
 *  in headless Chromium logs driver warnings, which the parity gate counts. Production always sweeps (motion and WebGL permitting). */
const sweepOn = () => !__TEST_HOOKS__ || (window as unknown as { __ttSweep?: boolean }).__ttSweep === true;

let active: { ctrl: ShaderController; handle: SweepHandle; canvas: HTMLCanvasElement; target: HTMLElement; raf: number } | null = null;

function reducedMotion(): boolean {
  return typeof window === "undefined" || !window.requestAnimationFrame || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function finish(): void {
  if (!active) return;
  const { ctrl, handle, canvas, target, raf } = active;
  active = null;
  cancelAnimationFrame(raf);
  handle.cancel();
  ctrl.destroy();
  canvas.remove();
  target.style.removeProperty("clip-path");
}

/** Plays one reveal sweep over `target`. Returns a promise that settles when it is finished (immediately when skipped). */
export function sweepReveal(target: HTMLElement | null | undefined): Promise<void> {
  if (!target || active || reducedMotion() || !sweepOn()) return Promise.resolve();
  const canvas = document.createElement("canvas");
  canvas.className = "tt-sweep";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas); // sized by CSS (fixed, full window) before glimm reads its box
  const ctrl = createShader({ canvas, palette: PALETTE, direction: "ltr", bandTight: 18, swellAmount: 0.35, rippleAmount: 0.6, waveAmount: 0 });
  if (!ctrl) { canvas.remove(); return Promise.resolve(); } // no WebGL: no sweep

  // Uncover the target up to the band's centre line, in window pixels.
  const reveal = () => {
    if (!active) return;
    const x = (-OVERSCAN + ctrl.getProgress() * (1 + 2 * OVERSCAN)) * window.innerWidth;
    const r = target.getBoundingClientRect();
    const hide = Math.max(0, Math.min(r.width, r.right - x));
    target.style.clipPath = `inset(0 ${hide}px 0 0)`;
    active.raf = requestAnimationFrame(reveal);
  };
  target.style.clipPath = "inset(0 100% 0 0)";
  const handle = playSweep(ctrl, { sweepMs: SWEEP_MS, outroMs: 200, easing: "easeInOutCubic", peakAlpha: 0.75 });
  active = { ctrl, handle, canvas, target, raf: requestAnimationFrame(reveal) };
  // The content must never stay hidden: the sweep's own end, or a safety timeout if frames stop (a background tab), both finish it.
  const safety = setTimeout(finish, SWEEP_MS + 1200);
  return handle.done.then(() => { clearTimeout(safety); finish(); });
}

/** Ends a running sweep at once and shows the content (a new track dropped mid-sweep, the view torn down). */
export function stopSweep(): void { finish(); }
