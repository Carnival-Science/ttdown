// The coach drawer (legacy buildCoach/coachContext): asks the Claude runtime's `sample` capability, streaming. Optional: without
// the runtime it says it isn't available. Same prompt and context as the legacy page (COACH_SETUP and coachData are shared).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCap } from "../runtime/claude";
import { domain } from "../domain";
import { getProg } from "../storage/data";
import { teardown } from "./teardown.svelte";
import { compareState } from "./compare.svelte";
import { app } from "./app.svelte";

const { coachData, COACH_SETUP, CAMPAIGN, IDEAS } = domain as any;
export interface QA { q: string; a: string; done: boolean }

class Coach {
  isOpen = $state(false);
  question = $state("");
  hint = $state("");
  log = $state<QA[]>([]);
  busy = $state(false);
  private ctrl: AbortController | null = null;
  private history: { q: string; a: string }[] = [];
  focusSignal = $state(0);
  open(text?: string, go?: boolean) { this.isOpen = true; this.focusSignal++; if (text) { this.question = text; if (go) void this.ask(); } }
  close() { this.isOpen = false; }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  context(): { tag: string; quick: string[]; text: string } {
    const v = app.route, strip = (h: string) => h.replace(/<[^>]+>/g, ""), curA = teardown.result, lastTeardown = app.lastTeardown;
    if (v === "teardown" && curA && !teardown.example) return { tag: (curA.title || "This song") + " · " + curA.bpm + " BPM · " + curA.key, quick: ["What should I do first?", "Explain this song's drums and how to copy them", "How do I get my 808 or bass to sound like this?", "What should I fix first in my version?"],
      text: `Below is an automatic analysis of a song they want to learn from (estimates from audio; say "check by ear" when confidence is low), plus the ideas the app generated for them.\nANALYSIS:\n${JSON.stringify(coachData(curA, { ideas: IDEAS, lastCompare: compareState.last }), null, 1)}` };
    if (v === "samples") return { tag: "Sample Lab", quick: ["How should I name and sort a new sample pack?", "How do I tune an 808 to my song's key?", "How do I chop a vocal sample in Slicex?"], text: `They are in the app's Sample Lab, sorting and learning to use samples.${lastTeardown ? " Their last analyzed song: " + JSON.stringify({ title: lastTeardown.title, bpm: lastTeardown.bpm, key: lastTeardown.key }) : ""}` };
    const all = CAMPAIGN.flatMap((c: any) => c.missions), prog = getProg(), cur = all.find((m: any) => m.id === app.openMission) || all.find((m: any) => !prog[m.id]) || all[0];
    return { tag: v === "learn" ? "Mission: " + cur.t : "FL Studio", quick: ["I'm stuck on this mission", "What does this window do?", "Quiz me on what I just learned"],
      text: `They are working through a 12-mission FL Studio campaign. If they ask for a quiz, ask 3 short questions one at a time.\nCURRENT MISSION: ${cur.t}: ${cur.goal}\nSTEPS: ${cur.steps.map(strip).join(" | ")}\nMISSIONS DONE: ${all.filter((m: any) => prog[m.id]).map((m: any) => m.t).join(", ") || "none yet"}${lastTeardown ? "\nTHEY ALSO ANALYZED A SONG: " + JSON.stringify({ title: lastTeardown.title, bpm: lastTeardown.bpm, key: lastTeardown.key }) : ""}` };
  }
  async ask() {
    const question = this.question.trim(); if (!question) { this.hint = "Type a question first."; return; }
    this.hint = "";
    this.log.push({ q: question, a: "Thinking…", done: false }); const qa = this.log[this.log.length - 1]!; this.question = "";
    const sample = await useCap("sample");
    if (!sample) { qa.a = "The coach isn't available in this view. Open this page on claude.ai to use it."; qa.done = true; return; }
    if (this.ctrl) this.ctrl.abort(); this.ctrl = new AbortController(); const ctrl = this.ctrl;
    const c = this.context(), hist = this.history.slice(-2).map(h => `EARLIER QUESTION: ${h.q}\nYOUR EARLIER ANSWER: ${h.a.slice(0, 700)}`).join("\n");
    const prompt = `${COACH_SETUP}\n\n${c.text}\n\n${hist ? hist + "\n\n" : ""}QUESTION: ${question}`;
    this.busy = true;
    try { const r = await sample(prompt, { signal: ctrl.signal, onText: ({ text }: { text: string }) => { qa.a = text; } }); qa.a = r.text || qa.a; this.history.push({ q: question, a: qa.a }); }
    catch (e: any) { if (e && e.name === "AbortError") { qa.a = "Stopped."; return; } qa.a = e && e.code === "rate_limited" ? "Too many questions at once. Wait a minute and try again." : e && e.code === "not_granted" ? "The coach needs your permission to answer. Try again and allow it." : "The coach couldn't answer just now. Try again in a moment."; }
    finally { this.busy = false; qa.done = true; }
  }
}
export const coach = new Coach();
