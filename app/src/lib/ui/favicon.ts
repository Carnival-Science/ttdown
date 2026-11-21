// The tab icon. At rest it is the three green discs (public/favicon.svg). While the note model (Basic Pitch) transcribes, the discs turn
// cobalt and light up one after another, a slow round like the orbit in the motif, so a tab in the background shows the work is still
// going. Browsers do not animate SVG favicons (Chrome draws the first frame only), so the frames are drawn here and swapped on a timer;
// a background tab throttles that timer to about once a second, which only slows the round. Under prefers-reduced-motion the icon is
// cobalt and still. Safari shows PNG favicons, not SVG ones, so it keeps the static green icon either way.

// Same geometry as public/favicon.svg (and the toolbar mark): centre x, centre y, radius.
const DISCS: [number, number, number][] = [[11.5, 17, 9.5], [20.5, 12.5, 8.5], [19, 21.5, 7]];
const BASE = ["#A3B1EA", "#8C9DE3", "#7086DA"]; // light cobalt, three steps (multiplied where they overlap, so they start light)
const GLOW = "#E3E9FD";
const FRAMES = 18, STEP_MS = 110;

const mix = (a: string, b: string, t: number) => {
  const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return "#" + [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("");
};
/** One frame: each disc brightens and swells a touch as the glow passes it (a smooth pulse, a third of a turn apart). */
function frame(phase: number | null): string {
  const circles = DISCS.map(([x, y, r], i) => {
    const t = phase == null ? 0 : Math.max(0, Math.cos(2 * Math.PI * (phase - i / 3))) ** 2;
    const halo = t > 0.05 ? `<circle cx="${x}" cy="${y}" r="${(r + 2.4).toFixed(2)}" fill="${GLOW}" fill-opacity="${(0.45 * t).toFixed(3)}"/>` : "";
    return halo + `<circle cx="${x}" cy="${y}" r="${(r + 0.9 * t).toFixed(2)}" fill="${mix(BASE[i]!, GLOW, 0.8 * t)}" fill-opacity=".88" style="mix-blend-mode:multiply"/>`;
  }).join("");
  return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${circles}</svg>`);
}

let link: HTMLLinkElement | null = null, rest = "", timer = 0, frames: string[] = [];

function icon(): HTMLLinkElement | null {
  if (link) return link;
  link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
  if (link) rest = link.getAttribute("href") || "";
  return link;
}

/** Turns the working icon on or off. Idempotent. */
export function faviconWorking(on: boolean): void {
  if (typeof document === "undefined") return;
  const el = icon(); if (!el) return;
  clearInterval(timer); timer = 0;
  if (!on) { el.setAttribute("href", rest); el.removeAttribute("data-working"); return; }
  el.setAttribute("data-working", "");
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { el.setAttribute("href", frame(null)); return; }
  if (!frames.length) frames = Array.from({ length: FRAMES }, (_, k) => frame(k / FRAMES));
  let k = 0; el.setAttribute("href", frames[0]!);
  timer = window.setInterval(() => { k = (k + 1) % FRAMES; el.setAttribute("href", frames[k]!); }, STEP_MS);
}
