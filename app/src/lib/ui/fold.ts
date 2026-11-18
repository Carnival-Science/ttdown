// Fold long cards and hide help text until asked (port of the legacy page's foldCard()/helpToggle()/tidy(), index.html).
// Svelte attachments: {@attach fold({ open, head, summary })} on a card, {@attach helpText()} on a paragraph.
import type { Attachment } from "svelte/attachments";

export function fold(opts: { open: boolean; head?: string; summary?: string }): Attachment<HTMLElement> {
  return card => {
    const head = (opts.head ? card.querySelector<HTMLElement>(opts.head) : card.firstElementChild as HTMLElement | null);
    if (!head) return;
    card.classList.add("fold"); card.classList.toggle("folded", !opts.open);
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "foldbtn"; btn.setAttribute("aria-label", "Show or hide");
    const sync = () => { const f = card.classList.contains("folded"); btn.textContent = f ? "+" : "–"; btn.setAttribute("aria-expanded", String(!f)); };
    const toggle = () => { card.classList.toggle("folded"); sync(); };
    const onBtn = (e: Event) => { e.stopPropagation(); toggle(); };
    const onHead = (e: Event) => { if ((e.target as Element).closest("button,input,select,a,label")) return; toggle(); };
    btn.addEventListener("click", onBtn); head.classList.add("foldhead"); head.addEventListener("click", onHead); head.append(btn); sync();
    let sum: HTMLElement | null = null;
    if (opts.summary) { sum = document.createElement("span"); sum.className = "foldsum small"; sum.textContent = opts.summary; head.after(sum); }
    return () => { btn.remove(); sum?.remove(); head.removeEventListener("click", onHead); head.classList.remove("foldhead"); card.classList.remove("fold", "folded"); };
  };
}

export function helpText(): Attachment<HTMLElement> {
  return p => {
    p.classList.add("helptext");
    const b = document.createElement("button"); b.type = "button"; b.className = "helpbtn"; b.setAttribute("aria-expanded", "false"); b.textContent = "? How it works";
    const on = () => { const s = p.classList.toggle("show"); b.setAttribute("aria-expanded", String(s)); };
    b.addEventListener("click", on); p.before(b);
    return () => { b.remove(); p.classList.remove("helptext", "show"); };
  };
}
