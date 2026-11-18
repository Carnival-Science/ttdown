<!-- Beat journal: one card per song rebuilt, and producer habits across saved teardowns (legacy renderJournal + habitsPanel). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { journalAll, journalPut, loadHist } from "../lib/storage/data";
  import { account } from "../lib/storage/account.svelte";
  import { domain } from "../lib/domain";
  const { PART_NAMES, GENRES, genreOf, posList, hatFeel, fmtT } = domain as any;
  let rev = $state(0);
  const list = $derived.by(() => { void rev; void account.rev; return journalAll().sort((p: any, q: any) => String(q.updatedAt || q.createdAt).localeCompare(String(p.updatedAt || p.createdAt))); });
  let saved = $state<Record<string, boolean>>({}), copied = $state<Record<string, boolean>>({});
  function save(e: any, patch: Record<string, string>) { Object.assign(e, patch); journalPut({ ...e }); saved[e.id] = true; setTimeout(() => { saved[e.id] = false; }, 1500); }
  const best = (e: any) => (e.exports || []).reduce((m: number, x: any) => Math.max(m, x.score || 0), 0);
  const last = (e: any) => (e.exports || []).slice(-1)[0];
  function portfolio(e: any) { const b = best(e); const t = `${e.title}: rebuilt in FL Studio at ${e.ref.bpm} BPM in ${e.ref.key}${b ? `, ${b}% match to the reference` : ""}. ${e.learned ? "Learned: " + e.learned.split("\n")[0] : ""}`.trim(); navigator.clipboard.writeText(t).then(() => { copied[e.id] = true; }, () => {}); }
  // producer habits
  const hist = $derived.by(() => { void account.rev; return loadHist(); });
  let pick = $state<number[]>([]);
  const sel = $derived(hist.filter((_x, i) => pick.includes(i)) as any[]);
  const pos = (arr: boolean[]) => posList(arr).join(" ") || "–", avg = (arr: number[]) => Math.round(arr.reduce((p, q) => p + q, 0) / arr.length);
  const ROWS: [string, (x: any) => string][] = [["Tempo", x => x.bpm + " BPM"], ["Key", x => `${x.key} (${x.camelot})`], ["Style", x => GENRES[genreOf(x)].name], ["Kick", x => pos(x.pattern.kick)], ["Snare / clap", x => pos(x.pattern.snare)], ["Hats", x => hatFeel(x.pattern.hats)], ["Swing", x => x.swing ? Math.round(x.swing.late * 100) + "%" : "–"], ["Chord loop", x => x.chords && x.chords.loop ? x.chords.loop.join(" ") : "–"], ["Sections", x => x.sections.map((s: any) => s.label[0]).join("")], ["Length", x => fmtT(x.duration)], ["Sub share", x => x.balance[0] + "%"]];
  const habits = $derived.by(() => {
    if (sel.length < 2) return [];
    const minors = sel.filter(x => /minor/.test(x.key)).length, kickCount: Record<string, number> = {}; sel.forEach(x => posList(x.pattern.kick).forEach((p: string) => { kickCount[p] = (kickCount[p] || 0) + 1; }));
    const sharedKick = Object.keys(kickCount).filter(k => kickCount[k] === sel.length);
    return [`Average tempo ${avg(sel.map(x => x.bpm))} BPM (range ${Math.min(...sel.map(x => x.bpm))}–${Math.max(...sel.map(x => x.bpm))}).`, `${minors} of ${sel.length} are in a minor key.`, sharedKick.length ? `Every one has a kick at ${sharedKick.join(", ")}.` : "No kick position is shared by all of them.", `Average length ${fmtT(avg(sel.map(x => x.duration)))}; sub share ${avg(sel.map(x => x.balance[0]))}% on average.`];
  });
  function togglePick(i: number) { if (pick.includes(i)) pick = pick.filter(x => x !== i); else if (pick.length < 5) pick = [...pick, i]; }
</script>

{#snippet stat(big: string, label: string, small: string)}<div class="stat"><b>{big}</b><span>{label}</span><small>{small}</small></div>{/snippet}

<header class="hero"><span class="eyebrow">Your portfolio</span><h1>Beat journal</h1><p class="lead">Every song you rebuild gets a card: the reference, your track, your best score, what you learned and what Saman said. A card is created the first time you upload your version in Compare.</p></header>
{#if list.length}
  <div style="display:grid;gap:16px">
    {#each list as e (e.id)}
      {@const b = best(e)}{@const l = last(e)}
      <article class="panel jcard">
        <div class="row" style="justify-content:space-between"><h2>{e.title}</h2><span class={"tag" + (e.status === "Finished" || e.status === "Released" ? "" : " example")}>{e.status || "In progress"}</span></div>
        <div class="stats">{@render stat(b ? b + "%" : "–", "Best score", l ? `${(e.exports || []).length} exports` : "Not compared yet")}{@render stat(String(e.ref.bpm), "BPM", e.ref.key)}{@render stat(e.ref.camelot, "Camelot", e.ref.style)}</div>
        {#if l && l.parts}<p class="small">{"Latest: " + PART_NAMES.map(([k, n]: [string, string]) => `${n} ${l.parts[k]}%`).join(" · ")}</p>{/if}
        <label class="small" for={"mine-" + e.id}>My track</label>
        <input id={"mine-" + e.id} type="text" aria-label="My track's file name or link" placeholder="My MP3 name or a link (SoundCloud, Drive…)" value={e.mine || (l ? l.name : "")} onchange={ev => save(e, { mine: ev.currentTarget.value.slice(0, 300) })}>
        <label class="small" for={"learned-" + e.id}>What I learned</label>
        <textarea id={"learned-" + e.id} aria-label="What I learned" placeholder="What I learned making this" value={e.learned || ""} onchange={ev => save(e, { learned: ev.currentTarget.value.slice(0, 2000) })}></textarea>
        <label class="small" for={"saman-" + e.id}>What Saman said</label>
        <textarea id={"saman-" + e.id} aria-label="What Saman said" placeholder="What Saman said (paste his notes)" value={e.saman || ""} onchange={ev => save(e, { saman: ev.currentTarget.value.slice(0, 2000) })}></textarea>
        <div class="row"><span class="small">Status</span>
          <select class="isel" aria-label="Status" value={e.status || "In progress"} onchange={ev => save(e, { status: ev.currentTarget.value })}>{#each ["In progress", "Finished", "Sent to Saman", "Released"] as x (x)}<option value={x}>{x}</option>{/each}</select>
          <span class="small" role="status">{saved[e.id] ? "Saved" : ""}</span>
          <button class="btn" type="button" onclick={() => portfolio(e)}>{copied[e.id] ? "Copied" : "Copy as a portfolio line"}</button>
        </div>
      </article>
    {/each}
  </div>
{:else}
  <section class="panel"><p>No beats yet. Teardown a song, build it, export it from FL Studio and upload it in the Compare tab. It'll show up here.</p><a class="btn primary" href="#teardown" style="text-decoration:none;justify-self:start">Teardown a song</a></section>
{/if}
<section class="panel">
  <h2>Producer habits: compare songs side by side</h2>
  <p class="small">Pick 2–5 songs you've torn down (for example three by one artist). You'll see their tempo, keys, drum positions and layout side by side, plus what they have in common.</p>
  {#if hist.length}
    <div class="row" style="gap:6px">{#each hist as x, i (i)}<button type="button" class={"btn" + (pick.includes(i) ? " cool" : "")} aria-pressed={(pick.includes(i))} onclick={() => togglePick(i)}>{x.title || "Untitled"}</button>{/each}</div>
  {:else}<p class="small">Teardown a few songs first; they appear here.</p>{/if}
  <div>
    {#if sel.length < 2}<p class="small">Pick at least 2 songs.</p>
    {:else}
      <ul>{#each habits as t (t)}<li>{t}</li>{/each}</ul>
      <div class="scroll"><table><thead><tr><th></th>{#each sel as x, i (i)}<th>{x.title || "Untitled"}</th>{/each}</tr></thead>
        <tbody>{#each ROWS as [n, f] (n)}<tr><td><b>{n}</b></td>{#each sel as x, i (i)}<td class="mono small">{f(x)}</td>{/each}</tr>{/each}</tbody></table></div>
    {/if}
  </div>
</section>
