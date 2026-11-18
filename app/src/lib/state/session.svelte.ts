// The practice-session timer (legacy buildSession): one goal, 15/25/45 minutes, logged in the practice log when it ends.
// The running session is stored under td_session_v1 so it survives a reload, as in the legacy page.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { KEYS, lsGet, lsSet } from "../storage/local";
import { addLog, planDone, getProg } from "../storage/data";
import { account } from "../storage/account.svelte";
import { audio } from "../audio/service.svelte";
import { domain } from "../domain";
import { app } from "./app.svelte";
import { teardown } from "./teardown.svelte";

const { dayStr, buildPlan, genreOf, CAMPAIGN, tdId } = domain as any;
interface Sess { start: number; mins: number; goal: string; ref?: { id: string; step: number } | null }

class Session {
  running = $state.raw<Sess | null>(lsGet<Sess | null>(KEYS.session, null));
  left = $state(0);
  msg = $state("");
  lastRef = $state.raw<{ id: string; step: number } | null>(null);
  composing = $state(false);
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor() { if (this.running && this.running.start) this.run(); }
  defGoal(): string {
    try {
      const a = teardown.result;
      if (app.route === "teardown" && a && !teardown.example) { const st = buildPlan(a, genreOf(a)), done = new Set(planDone(a)), i = st.findIndex((_x: any, j: number) => !done.has("s" + j)); if (i >= 0) return `${a.title || "Rebuild"}: ${st[i].t}`; }
      const all = CAMPAIGN.flatMap((c: any) => c.missions), pr = getProg(), m = all.find((x: any) => !pr[x.id]); return m ? "Mission: " + m.t : "Finish an 8-bar loop";
    } catch { return "Finish an 8-bar loop"; }
  }
  start(goal: string, mins: number, ref?: { id: string; step: number }) { const s = { start: Date.now(), mins, goal, ref: ref || null }; lsSet(KEYS.session, s); this.running = s; this.msg = ""; this.composing = false; this.run(); }
  private run() {
    if (this.timer) clearInterval(this.timer);
    const upd = () => { const s = this.running; if (!s) return; const left = s.mins * 60 - (Date.now() - s.start) / 1000; if (left <= 0) { this.finish(s.mins, false); return; } this.left = left; };
    upd(); if (this.running) this.timer = setInterval(upd, 1000);
  }
  end() { const s = this.running; if (s) this.finish(Math.round((Date.now() - s.start) / 60000), true); }
  private finish(mins: number, early: boolean) {
    const s = this.running!; if (this.timer) { clearInterval(this.timer); this.timer = null; }
    lsSet(KEYS.session, null); this.running = null; this.lastRef = s.ref || null;
    if (mins >= 1) addLog({ date: dayStr(new Date()), minutes: mins, what: "Timed session", score: "", note: s.goal });
    if (!early) this.beep();
    this.msg = mins >= 1 ? `Logged ${mins} min: ${s.goal}` : "Under a minute, so nothing was logged.";
    if (!(mins >= 1)) this.lastRef = null;
  }
  /** After a logged session started from a Build-it step: tick that step off (legacy "Tick off step N"). */
  tickOff() {
    const ref = this.lastRef; if (!ref) return;
    const all = lsGet<Record<string, string[]>>(KEYS.plan, {}), id = "plan-" + ref.id;
    const d = new Set<string>(((account.state === "account" && account.docs[id] ? account.docs[id].done : all[id]) || []) as string[]); d.add("s" + ref.step);
    all[id] = Array.from(d); lsSet(KEYS.plan, all); account.put(id, { type: "plan", ...(account.docs[id] || {}), done: Array.from(d) });
    this.lastRef = null; this.ticked = true;
    if (teardown.result && tdId(teardown.result) === ref.id) teardown.rev++;
  }
  ticked = $state(false);
  private beep() { try { const o = audio.context(), ac = o.ctx, osc = ac.createOscillator(), g = ac.createGain(); osc.frequency.value = 880; g.gain.setValueAtTime(0.2, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8); osc.connect(g).connect(o.out); osc.start(); osc.stop(ac.currentTime + 0.85); setTimeout(() => o.close(), 1200); } catch { /* no audio */ } }
}
export const session = new Session();
