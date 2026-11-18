// The app's saved data, one function per legacy function (index.html), same keys, shapes, limits and account documents.
// Reads go to the account when it is connected, writes go to both (as in the legacy page).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { KEYS, lsGet, lsSet, lsTrySet } from "./local";
import { account } from "./account.svelte";
import { domain } from "../domain";
import { TimingStore } from "../persistence/timing";
import type { AnalysisResult } from "../engine";

const { tdId, GENRES, genreOf, shelfId, SFOLDER, suggestName } = domain;
const acc = () => account.state === "account";

// ---- history (teardown_history_v1; account docs type "teardown"), with the persisted-timing contract (docs/PERSISTENCE.md)
export function loadHist(): AnalysisResult[] {
  const list: AnalysisResult[] = acc()
    ? account.ofType("teardown").sort((x, y) => String(y.savedAt).localeCompare(String(x.savedAt))).map(v => v.a).slice(0, 24)
    : lsGet<AnalysisResult[]>(KEYS.history, []);
  list.forEach(r => TimingStore.attach(r));
  return list;
}
/** Returns the user-facing note ("" when saved normally) and whether it is an error. Storage failures are never silent. */
export function saveHist(a: AnalysisResult): { note: string; bad: boolean } {
  const rest = lsGet<AnalysisResult[]>(KEYS.history, []).filter(x => x.title !== a.title || x.duration !== a.duration);
  let rec = TimingStore.forStorage(a), note = "", bad = false, ok = lsTrySet(KEYS.history, [rec].concat(rest).slice(0, 12));
  if (!ok && rec.timing !== undefined) {
    const lean = { ...rec }; delete lean.timing;
    if (lsTrySet(KEYS.history, [lean].concat(rest).slice(0, 12))) { ok = true; rec = lean; note = "Saved, but without its tracked beats: this browser's storage is nearly full. It will reopen with a constant-tempo ruler. Delete old teardowns to make room."; }
  }
  if (!ok) { note = "Couldn't save this teardown: this browser's storage is full. Your earlier saved teardowns were not changed. Delete some and try again."; bad = true; }
  account.put(tdId(a), { type: "teardown", savedAt: new Date().toISOString(), a: rec });
  return { note, bad };
}

// ---- Build-it plan ticks (td_plan_v1; docs "plan-<tdId>")
export function planDone(a: AnalysisResult): string[] { const id = "plan-" + tdId(a); if (acc() && account.docs[id]) return account.docs[id].done || []; return lsGet<Record<string, string[]>>(KEYS.plan, {})[id] || []; }
export function setPlanDone(a: AnalysisResult, done: string[]) { const id = "plan-" + tdId(a), all = lsGet<Record<string, string[]>>(KEYS.plan, {}); all[id] = done; lsSet(KEYS.plan, all); account.put(id, { type: "plan", title: a.title || "", done }); }

// ---- idea favourites (idea_favs_v1; docs "idea-<ts>")
export function favList(): any[] { if (acc()) return account.ofType("idea").sort((p, q) => String(q.savedAt).localeCompare(String(p.savedAt))); return lsGet<any[]>(KEYS.favs, []); }
export function favAdd(kind: string, data: any, a: AnalysisResult) { const id = "idea-" + Date.now(), doc = { type: "idea", kind, label: data.label, song: a.title || "", bpm: a.bpm, key: a.key, data: JSON.parse(JSON.stringify(data)), savedAt: new Date().toISOString() }; const l = lsGet<any[]>(KEYS.favs, []); l.unshift({ id, ...doc }); lsSet(KEYS.favs, l.slice(0, 200)); account.put(id, doc); }
export function favDel(id: string) { lsSet(KEYS.favs, lsGet<any[]>(KEYS.favs, []).filter(x => x.id !== id)); account.remove(id); }

// ---- journal (beat_journal_v1; docs "jr-<tdId>")
export function journalAll(): any[] { if (acc()) return account.ofType("journal"); return lsGet<any[]>(KEYS.journal, []); }
export function journalGet(id: string) { return journalAll().find(x => x.id === id) || null; }
export function journalPut(e: any) { const { id } = e, doc = { ...e }; delete doc.id; doc.type = "journal"; doc.updatedAt = new Date().toISOString(); const l = lsGet<any[]>(KEYS.journal, []).filter(x => x.id !== id); l.unshift({ id, ...doc }); lsSet(KEYS.journal, l.slice(0, 200)); account.put(id, doc); }
export function journalFor(a: AnalysisResult, create: boolean) { const id = "jr-" + tdId(a); let e = journalGet(id); if (!e && create) { e = { id, title: a.title || "Untitled", ref: { bpm: a.bpm, key: a.key, camelot: a.camelot, style: GENRES[genreOf(a)].name }, exports: [], learned: "", saman: "", status: "In progress", createdAt: new Date().toISOString() }; journalPut(e); } return e; }
export function journalAddExport(ref: AnalysisResult, c: any) { const e = journalFor(ref, true); e.exports = (e.exports || []).concat([{ name: c.name, date: new Date().toISOString(), score: c.score, parts: c.parts }]).slice(-30); journalPut(e); }

// ---- practice log (fl_log_v1; docs "s-<ts>")
export function getLog(): any[] { const src = acc() ? account.ofType("session") : lsGet<any[]>(KEYS.log, []); return src.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
export function addLog(entry: Record<string, unknown>) { const id = "s-" + Date.now(), x = { id, type: "session", createdAt: new Date().toISOString(), ...entry }; const local = lsGet<any[]>(KEYS.log, []); local.unshift(x); lsSet(KEYS.log, local.slice(0, 300)); account.put(id, x); }
export function delLog(id: string) { lsSet(KEYS.log, lsGet<any[]>(KEYS.log, []).filter(x => x.id !== id)); account.remove(id); }

// ---- mission progress (fl_campaign_v1; doc "progress")
export function getProg(): Record<string, string> { return acc() && account.docs.progress ? { ...account.docs.progress.m } : lsGet<Record<string, string>>(KEYS.progress, {}); }
export function setProg(p: Record<string, string>) { lsSet(KEYS.progress, p); account.put("progress", { type: "progress", m: p }); }

// ---- sample shelf (sample_shelf_v1; docs shelfId)
export function shelfList(): any[] { if (acc()) return account.ofType("sample"); return lsGet<any[]>(KEYS.shelf, []); }
export function isShelved(it: any) { const id = shelfId(it); return shelfList().some(x => x.id === id); }
export function shelve(it: any) { const id = shelfId(it), doc = { type: "sample", name: it.name, kind: it.type, note: it.note ? it.note.name : "", bpm: it.bpm || null, dur: it.dur, folder: SFOLDER[it.type], suggested: suggestName(it), savedAt: new Date().toISOString() }; const l = lsGet<any[]>(KEYS.shelf, []).filter(x => x.id !== id); l.unshift({ id, ...doc }); lsSet(KEYS.shelf, l.slice(0, 500)); account.put(id, doc); }
export function unshelve(id: string) { lsSet(KEYS.shelf, lsGet<any[]>(KEYS.shelf, []).filter(x => x.id !== id)); account.remove(id); }
