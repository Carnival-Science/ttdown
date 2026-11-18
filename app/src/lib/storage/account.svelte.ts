// Account storage: private per-person documents in the Claude runtime (data/users/<uid>), with this-browser fallback.
// Port of the legacy page's ACC / initAccount / migrateLocal / accSet / accDel (index.html), same collection path, document
// ids and types. Optional: without the runtime the state becomes "local" and everything uses localStorage.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCap, hasRuntime } from "../runtime/claude";
import { KEYS, lsGet } from "./local";

export type AccountState = "connecting" | "local" | "account";
export interface Doc { type: string; [k: string]: any }

class Account {
  state = $state<AccountState>("connecting");
  /** Bumped on every change to `docs`, so views that read documents re-derive. */
  rev = $state(0);
  docs: Record<string, Doc> = {};
  col: any = null;
  note = $state("");
  private migrated = false;
  private idOf: (a: any) => string = () => "";

  get label(): string {
    return this.state === "account" ? "Saved to your Claude account, so it shows up on any device."
      : this.state === "connecting" ? "Connecting to your saved progress…"
      : "Saved in this browser only. Open the app on claude.ai, signed in, to save across devices.";
  }
  async init(tdId: (a: any) => string) {
    this.idOf = tdId;
    if (!hasRuntime()) { this.state = "local"; return; }
    const timer = setTimeout(() => { if (this.state === "connecting") this.state = "local"; }, 10000);
    try {
      const [db, user] = await Promise.all([useCap("db"), useCap("user")]);
      const uid = user ? await user.id() : null;
      if (!db || !uid) { clearTimeout(timer); this.state = "local"; return; }
      this.col = db.collection("data/users/" + uid);
      this.col.onSnapshot((snap: any) => {
        this.docs = Object.fromEntries(snap.docs.map((d: any) => [d.id, d.data()]));
        if (!snap.metadata || !snap.metadata.fromCache) { clearTimeout(timer); this.state = "account"; this.migrateLocal(); this.retryUnsynced(); }
        this.rev++;
      }, () => { clearTimeout(timer); this.state = "local"; this.col = null; this.rev++; });
    } catch { clearTimeout(timer); this.state = "local"; }
  }
  /* Copy what this browser saved while it was offline, or before the account connected, up to the account. It only ever ADDS: a document
     the account already has is never overwritten, and nothing is ever written back into localStorage. Every kind of saved data is
     covered (the legacy page migrated only history, log and progress, so plan ticks, saved ideas, journal cards and shelf items made
     offline disappeared from view once the account took over reads). */
  private migrateLocal() {
    if (this.migrated || !this.col) return; this.migrated = true;
    const add = (id: string, doc: Doc) => { if (id && !this.docs[id]) void this.set(id, doc); };
    const lp = lsGet<Record<string, string>>(KEYS.progress, {}); if (Object.keys(lp).length) add("progress", { type: "progress", m: lp });
    lsGet<any[]>(KEYS.history, []).forEach(a => add(this.idOf(a), { type: "teardown", savedAt: new Date().toISOString(), a }));
    lsGet<any[]>(KEYS.log, []).forEach(x => add(x.id, x));
    Object.entries(lsGet<Record<string, string[]>>(KEYS.plan, {})).forEach(([id, done]) => add(id, { type: "plan", title: "", done }));
    lsGet<any[]>(KEYS.favs, []).forEach(({ id, ...doc }) => add(id, { type: "idea", ...doc }));
    lsGet<any[]>(KEYS.journal, []).forEach(({ id, ...doc }) => add(id, { type: "journal", ...doc }));
    lsGet<any[]>(KEYS.shelf, []).forEach(({ id, ...doc }) => add(id, { type: "sample", ...doc }));
  }
  /* A write the account refused or could not complete is remembered and retried at the next connection event, instead of staying
     only in this browser. */
  private unsynced = new Map<string, Doc>();
  private retryUnsynced() { for (const [id, doc] of [...this.unsynced]) void this.set(id, doc); } // set() forgets an entry once it succeeds
  /** Write locally-known state to the account (if connected). */
  put(id: string, doc: Doc) { if (!this.col) return; this.docs[id] = doc; this.rev++; void this.set(id, doc); }
  remove(id: string) { if (!this.col) return; delete this.docs[id]; this.rev++; void this.del(id); }
  async set(id: string, data: Doc): Promise<boolean> {
    if (!this.col) return false;
    try { await this.col.doc(id).set(data); this.unsynced.delete(id); return true; }
    catch (e: any) {
      this.unsynced.set(id, data); this.note = e && e.code === "quota_exceeded" ? "Your saved space is full. Delete old log entries." : "Couldn't save to your account just now; kept in this browser."; return false; }
  }
  private async del(id: string) { if (!this.col) return; try { await this.col.doc(id).delete(); } catch { /* ignore, like the legacy page */ } }
  ofType(type: string): Array<Doc & { id: string }> { return Object.entries(this.docs).filter(([, v]) => v && v.type === type).map(([id, v]) => ({ id, ...v })); }
}
export const account = new Account();
