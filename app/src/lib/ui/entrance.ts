// The workspace's entrance when a teardown arrives on the stage (an analysis finishing, or a saved one opened from Recent): its parts
// rise into place one after another instead of all popping in at once. When the shader band sweeps (sweep.ts), each part rises as the
// band uncovers it: the arrangement on the left first, then the findings on the right. Swapping one open teardown for another plays
// the same rise, without the band and sooner.
//
// Opacity and transform only (the compositor runs them), through the Web Animations API, so nothing is left in the DOM afterwards and a
// part is clickable the whole time. Nothing plays under prefers-reduced-motion. Nothing here knows about Svelte.

declare const __TEST_HOOKS__: boolean;
/** The bench build plays it only when a test asks (window.__ttSweep = true, the same opt-in as the band): mid-entrance, a part's box is
 *  still moving, which layout tests would read. Production always plays it (motion permitting). */
const on = () => !__TEST_HOOKS__ || (window as unknown as { __ttSweep?: boolean }).__ttSweep === true;

const EASE = "cubic-bezier(.23, 1, .32, 1)"; // a strong ease-out: quick to start, soft to land
const RISE_MS = 340, STEP_MS = 60;
/** When the band uncovers the left and right halves of the window (glimm's 900 ms easeInOutCubic sweep: its centre line crosses
 *  10% of the width at about 330 ms and 80% at about 530 ms). The parts start a touch before, so they rise as they are uncovered. */
const SWEPT = { left: 260, right: 460 }, PLAIN = { left: 0, right: 90 };

/** Parts of the workspace, in the order they arrive, and which half of the window they are in. */
const PARTS: [selector: string, side: "left" | "right"][] = [
  [".workspace > .main.panel", "left"],
  ["#explorer > .top", "left"],
  ["#explorer .songmap", "left"],
  ["#explorer > .editor", "left"],
  [".workspace > .inspector.panel", "right"],
  [".inspector .findings > *", "right"],
  [".workspace > .sheetbar", "left"],
];

let running: Animation[] = [];

/** Plays the entrance over `stage`. `swept`: the shader band is crossing at the same time. */
export function enterWorkspace(stage: HTMLElement | null | undefined, swept: boolean): void {
  stopEntrance();
  if (!stage || !on() || typeof stage.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const at = swept ? SWEPT : PLAIN, n = { left: 0, right: 0 };
  for (const [sel, side] of PARTS) {
    for (const el of stage.querySelectorAll<HTMLElement>(sel)) {
      const panel = el.classList.contains("panel");
      const delay = at[side] + STEP_MS * n[side]++;
      // a panel (the surface) settles with a slight lift; what is on it rises a little further, so the content arrives onto the surface
      const from = panel ? { opacity: 0, transform: "translateY(6px) scale(.995)" } : { opacity: 0, transform: "translateY(10px)" };
      running.push(el.animate([from, { opacity: 1, transform: "none" }], { id: "tt-enter", duration: RISE_MS, delay, easing: EASE, fill: "backwards" }));
    }
  }
}

/** Ends a running entrance at once (the view torn down, another teardown opened). */
export function stopEntrance(): void { for (const a of running) a.cancel(); running = []; }
