<!-- Learn FL Studio: progress, practice log, 12 missions, shortcuts, the FL coach and ear training (legacy renderLearn). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { domain } from "../lib/domain";
  import { getProg, setProg, getLog, addLog, delLog } from "../lib/storage/data";
  import { account } from "../lib/storage/account.svelte";
  import { app } from "../lib/state/app.svelte";
  import { coach } from "../lib/state/coach.svelte";
  import { compareState } from "../lib/state/compare.svelte";
  import { useCap } from "../lib/runtime/claude";
  import EarTraining from "../components/EarTraining.svelte";
  const { CAMPAIGN, SHORTCUTS, K, logStats, dayStr } = domain as any;
  let rev = $state(0);
  const prog = $derived.by(() => { void rev; void account.rev; return getProg(); });
  const all = CAMPAIGN.flatMap((c: any) => c.missions) as any[];
  const doneN = $derived(all.filter(m => prog[m.id]).length);
  const next = $derived(all.find(m => !prog[m.id]));
  $effect(() => { if (!app.openMission && next) app.openMission = next.id; });
  // practice log
  const log = $derived.by(() => { void rev; void account.rev; return getLog(); });
  const st = $derived(logStats(log));
  const nextM = $derived(all.find(m => !prog[m.id]) || all[0]);
  const whatOpts = $derived(["Mission: " + nextM.t, "Teardown / rebuild", "Free play", "Watched a tutorial", "DJ practice"].concat(all.map(m => "Mission: " + m.t)).filter((v, i, arr) => arr.indexOf(v) === i));
  let min = $state(""), what = $state(""), score = $state(""), note = $state(""), msg = $state("");
  $effect(() => { if (compareState.pendingScore != null) { score = String(compareState.pendingScore); what = "Teardown / rebuild"; } else if (!what) what = whatOpts[0]!; });
  function save() {
    const m = parseInt(min, 10);
    if (!(m > 0 && m < 1000)) { msg = "Enter the minutes you practiced, like 30."; return; }
    const sc = score.trim() === "" ? null : Math.max(0, Math.min(100, parseInt(score, 10) || 0));
    addLog({ date: dayStr(new Date()), minutes: m, what, score: sc, note: note.trim().slice(0, 300) });
    compareState.pendingScore = null; min = ""; score = ""; note = ""; msg = ""; rev++;
  }
  const cells = $derived.by(() => { const byDay: Record<string, number> = {}; log.forEach((x: any) => byDay[x.date] = (byDay[x.date] || 0) + (Number(x.minutes) || 0));
    const out = []; for (let i = 27; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = dayStr(d), v = byDay[k] || 0; out.push({ k, v }); } return out; });
  function toggleDone(m: any, done: boolean) { const p = getProg(); if (done) delete p[m.id]; else { p[m.id] = new Date().toISOString().slice(0, 10); app.openMission = null; } setProg(p); rev++; }
  // FL coach (in-page)
  let learnQ = $state(""), learnAns = $state("Ask anything about FL Studio. Your coach knows which mission you're on."), learnBusy = $state(false); let ctrl: AbortController | null = null;
  async function askLearn() {
    const q = learnQ.trim(); if (!q) { learnAns = "Type a question first."; return; }
    const sample = await useCap("sample");
    if (!sample) { learnAns = "The coach isn't available in this view. Open this page on claude.ai to use it."; return; }
    if (ctrl) ctrl.abort(); ctrl = new AbortController();
    const cur = all.find(m => m.id === app.openMission) || next || all[0];
    const strip = (h: string) => h.replace(/<[^>]+>/g, ""), lt = app.lastTeardown;
    const prompt = `You are a patient FL Studio teacher for a complete beginner who learns by doing. They are working through a mission campaign. Answer in plain words, with numbered steps, exact menu names and keyboard shortcuts (Windows; mention Cmd for Mac only if relevant). If menus differ between FL versions, say so briefly. If they ask for a quiz, ask 3 short questions one at a time about the current mission and wait for answers. Keep it under 200 words. End with one thing to try right now.

CURRENT MISSION: ${cur.t} — ${cur.goal}
STEPS: ${cur.steps.map(strip).join(" | ")}
MISSIONS DONE: ${all.filter(m => getProg()[m.id]).map(m => m.t).join(", ") || "none yet"}
${lt ? "THEY ALSO ANALYZED A SONG: " + JSON.stringify({ title: lt.title, bpm: lt.bpm, key: lt.key }) : ""}

QUESTION: ${q}`;
    learnBusy = true; learnAns = "Thinking…";
    try { const r = await sample(prompt, { signal: ctrl.signal, onText: ({ text }: any) => { learnAns = text; } }); learnAns = r.text || learnAns; }
    catch (e: any) { if (e && e.name === "AbortError") return; learnAns = e && e.code === "rate_limited" ? "Too many questions at once. Wait a minute and try again." : e && e.code === "not_granted" ? "The coach needs your permission to answer. Try again and allow it." : "The coach couldn't answer just now. Try again in a moment."; }
    finally { learnBusy = false; }
  }
</script>

{#snippet stat(big: string, label: string, small: string)}<div class="stat"><b>{big}</b><span>{label}</span><small>{small}</small></div>{/snippet}

<header class="hero">
  <span class="eyebrow">12 missions · zero to a finished track</span>
  <h1>Learn FL Studio</h1>
  <p class="lead">A 12-mission campaign from zero to a finished track. Do one mission per session: follow the steps in FL Studio, then mark it done. Stuck? Press “Ask the coach” in the corner of the screen, or “Ask about this” on any step.</p>
</header>
<section class="panel">
  <div class="row" style="justify-content:space-between"><h2>{`Progress: ${doneN} of ${all.length} missions`}</h2>{#if next}<span class="tag">{"Next: " + next.t}</span>{:else}<span class="tag">Campaign complete</span>{/if}</div>
  <div class="progress"><div style:width={100 * doneN / all.length + "%"}></div></div>
  <p class="small" id="save-note">{account.note || account.label}</p>
</section>
<section class="panel" id="log">
  <h2>Practice log</h2>
  <div class="stats">{@render stat(st.streak + (st.streak === 1 ? " day" : " days"), "Current streak", st.streak ? "Keep it alive tomorrow" : "Log today to start one")}{@render stat(Math.round(st.minutes / 6) / 10 + " h", "Total practice", st.sessions + (st.sessions === 1 ? " session" : " sessions"))}{@render stat(st.best == null ? "–" : st.best + "%", "Best closeness", "From Compare my version")}</div>
  <div><div class="small" style="margin-bottom:6px">Last 28 days</div>
    <div style="display:grid;grid-template-columns:repeat(28,minmax(0,1fr));gap:3px" aria-label="Practice minutes over the last 28 days">{#each cells as c (c.k)}<i title={`${c.k}: ${c.v} min`} style={`display:block;height:18px;border-radius:3px;background:${c.v ? "var(--accent)" : "#2b2d34"};opacity:${c.v ? Math.min(1, 0.35 + c.v / 90) : 1}`}></i>{/each}</div></div>
  <div class="row">
    <input type="text" id="log-min" inputmode="numeric" placeholder="Minutes, e.g. 30" aria-label="Minutes practiced" style="max-width:150px" bind:value={min}>
    <select id="log-what" aria-label="What you worked on" style="font:inherit;color:var(--ink);background:var(--inset);border:1px solid #000;border-radius:9px;padding:10px;max-width:100%" bind:value={what}>{#each whatOpts as v (v)}<option value={v}>{v}</option>{/each}</select>
    <input type="text" id="log-score" inputmode="numeric" placeholder="Closeness % (optional)" aria-label="Closeness score" style="max-width:190px" bind:value={score}>
  </div>
  <input type="text" id="log-note" placeholder="What did you learn or make?" aria-label="Note" bind:value={note}>
  <div class="row"><button class="btn primary" onclick={save}>Log session</button><span class="small" role="status">{msg}</span></div>
  {#if log.length}
    <div class="scroll"><table><thead><tr>{#each ["Date", "Min", "What", "Score", "Note", ""] as h, i (i)}<th>{h}</th>{/each}</tr></thead>
      <tbody>{#each log.slice(0, 12) as x (x.id)}<tr><td class="num">{x.date}</td><td class="num">{String(x.minutes)}</td><td>{x.what}</td><td class="num">{x.score == null ? "" : x.score + "%"}</td><td>{x.note || ""}</td><td><button class="btn" style="padding:2px 8px;font-size:0.75rem" aria-label="Delete this entry" onclick={() => { delLog(x.id); rev++; }}>Delete</button></td></tr>{/each}</tbody></table></div>
  {:else}<p class="small">No sessions yet. Log your first one when you finish a mission.</p>{/if}
</section>
{#each CAMPAIGN as c, ci (ci)}
  <section class="panel chapter">
    <h3><em>{String(ci + 1).padStart(2, "0")}</em>{c.ch.replace(/^Chapter \d+ · /, "")}</h3>
    {#each c.missions as m (m.id)}
      {@const done = !!prog[m.id]}{@const isOpen = app.openMission === m.id}
      <div class={"mission" + (done ? " done" : "") + (next && next.id === m.id ? " current" : "")}>
        <button class="mhead" aria-expanded={(isOpen)} onclick={() => { app.openMission = isOpen ? null : m.id; }}>
          <span class="check">{done ? "✓" : ""}</span><span><b>{m.t}</b><span class="small" style="display:block">{done ? "Done " + prog[m.id] : (next && next.id === m.id ? "Up next" : m.goal)}</span></span><span class="small">{isOpen ? "Hide" : "Open"}</span>
        </button>
        <div class="mbody" hidden={!isOpen}>
          <p>{m.goal}</p>
          <ol>{#each m.steps as s, i (i)}<li><span>{@html s + " "}</span><button class="btn" style="padding:2px 8px;font-size:0.78rem" type="button" onclick={() => { app.openMission = m.id; coach.open(`Mission "${m.t}", step ${i + 1}: ${s.replace(/<[^>]+>/g, "")}. Explain this step slowly. Where exactly do I click?`, true); }}>Ask about this</button></li>{/each}</ol>
          <p class="donewhen">{"Done when: " + m.done}</p>
          <p class="tip">{m.tip}</p>
          <div class="row"><button class={done ? "btn" : "btn primary"} onclick={() => toggleDone(m, done)}>{done ? "Mark as not done" : "Mark mission done"}</button></div>
        </div>
      </div>
    {/each}
  </section>
{/each}
<section class="panel">
  <h2>Keyboard shortcuts</h2>
  <p class="small">FL Studio on Windows. On a Mac, use Cmd where you see Ctrl.</p>
  <div class="sc">{#each SHORTCUTS as [title, rows] (title)}<div><h3 style="margin-bottom:6px">{title}</h3><table><tbody>{#each rows as [k, d] (k)}<tr><td>{@html K(k)}</td><td>{d}</td></tr>{/each}</tbody></table></div>{/each}</div>
</section>
<section class="panel" id="learn-coach">
  <h2>Ask your FL Studio coach</h2>
  <div class="row">{#each ["I'm stuck on this mission", "What does this window do?", "Quiz me on what I just learned"] as t (t)}<button class="btn" type="button" onclick={() => { learnQ = t; void askLearn(); }}>{t}</button>{/each}</div>
  <textarea id="learn-q" placeholder="e.g. “Where is the swing knob?” or “My kick is too quiet, what do I do?”" aria-label="Question for your FL Studio coach" bind:value={learnQ}></textarea>
  <div class="row"><button class="btn primary" disabled={learnBusy} onclick={askLearn}>Ask the coach</button></div>
  <div class="answer" role="status">{learnAns}</div>
</section>
<EarTraining />
