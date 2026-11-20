// A brief geometric confirmation where something was just saved: a ring that opens out and a tick that draws itself, about 0.7 s, then
// gone. Decorative (aria-hidden): the toast says what happened. Skipped entirely under prefers-reduced-motion.
export function confirmAt(target: Element | null | undefined): void {
  if (!target || typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const r = target.getBoundingClientRect(), el = document.createElement("div");
  el.className = "tt-confirm"; el.setAttribute("aria-hidden", "true");
  el.style.left = `${r.left + r.width / 2}px`; el.style.top = `${r.top + r.height / 2}px`;
  el.innerHTML = '<svg viewBox="-30 -30 60 60" width="60" height="60"><circle class="o" r="12"/><circle class="i" r="12"/><path class="t" d="M-6 0 L-1.5 4.5 L7 -5"/></svg>';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}
