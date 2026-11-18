<!-- Compare: upload my version, closeness score, part scores, progress, fixes, band chart, side-by-side tables, drums
     (legacy renderCompare + showCompare + bandChart + progressList). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { compareState } from "../lib/state/compare.svelte";
  import { journalFor, journalAddExport } from "../lib/storage/data";
  import { account } from "../lib/storage/account.svelte";
  import { domain } from "../lib/domain";
  import { engine } from "../lib/engine";
  import Rack from "../lib/ui/music/Rack.svelte";
  const { compare, partScores, PART_NAMES } = domain as any;
  const ref = $derived(teardown.result as any);
  const ex = $derived(teardown.example);
  let st = $state({ text: "", err: false });
  $effect(() => { st = { text: ex ? "Upload a real song first (step 1); then upload your rebuild here." : "Export your FL Studio project (File → Export → MP3 or WAV) and upload it here.", err: false }; });
  const c = $derived(compareState.last && compareState.last.ref === ref ? compareState.last : null);
  async function onFile(f: File | undefined) {
    if (!f) return;
    if (ex) { st = { text: "This is the example teardown. Upload a real reference song in step 1 first.", err: false }; return; }
    try {
      const me = await engine.analyze(f, p => { st = { text: `Analyzing your version… ${p}%`, err: false }; }, true);
      const r = teardown.result, cc = compare(r, me); cc.ref = r; cc.name = f.name; cc.parts = partScores(r, me, cc); compareState.last = cc;
      journalAddExport(r, cc);
      st = { text: `Compared “${f.name}” with “${r.title || "the reference"}”.`, err: false };
    } catch { st = { text: "Couldn't read your file. Export as MP3 or WAV and try again.", err: true }; }
  }
  const verdict = (s: number) => (s >= 85 ? "Very close. Polish the details." : s >= 65 ? "Getting there. Fix the top items." : "Early version. Start with tempo, key and drums.");
  const progress = $derived.by(() => { void account.rev; void compareState.last; const e = journalFor(ref, false); return e && e.exports && e.exports.length >= 2 ? e.exports.slice(-8) : null; });
  const delta = (rows: any[], i: number, k: string, v: number) => { const prev = i ? rows[i - 1] : null; return prev && prev.parts ? (v - prev.parts[k] > 0 ? ` ▲${v - prev.parts[k]}` : v - prev.parts[k] < 0 ? ` ▼${prev.parts[k] - v}` : "") : ""; };
  const nm = (r: string[]) => r[0]!.replace(/\s*[\d.].*$/, "");
  function logScore(score: number) { compareState.pendingScore = score; location.hash = "learn"; setTimeout(() => { const n = document.getElementById("log-min"); if (n) { n.scrollIntoView({ behavior: "smooth", block: "center" }); n.focus(); } }, 60); }
</script>

{#snippet stat(big: string | number, label: string, small: string)}<div class="stat"><b>{String(big)}</b><span>{label}</span>{#if small}<small>{small}</small>{/if}</div>{/snippet}
{#snippet tbl(head: string[], rows: any[][])}
  <div class="scroll"><table><thead><tr>{#each head as h (h)}<th>{h}</th>{/each}</tr></thead><tbody>{#each rows as r, i (i)}<tr>{#each r as v, j (j)}<td class={j ? "num" : ""}>{v}</td>{/each}</tr>{/each}</tbody></table></div>
{/snippet}

<section class="panel" id="compare" data-group="compare">
  <h2>Compare my version</h2>
  <p class="small">Upload your own track to see how close it is to this song, and exactly what to change in FL Studio.</p>
  <div class="row"><input type="file" id="mine" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac" aria-label="Upload your version" onchange={e => onFile(e.currentTarget.files?.[0])}></div>
  <p class={"status" + (st.err ? " err" : "")} role="status">{st.text}</p>
  <div style="display:grid;gap:14px">
    {#if c}
      <div class="stats">{@render stat(c.score + "%", "Closeness", verdict(c.score))}{@render stat(c.fixes.length, "Things to fix", c.fixes.length ? "Top ones listed first" : "Nothing major")}</div>
      {#if c.parts}<div class="stats">{#each PART_NAMES as [k, n] (k)}{@render stat(c.parts[k] + "%", n, c.parts[k] >= 85 ? "Matches" : c.parts[k] >= 60 ? "Close" : "Work on this")}{/each}</div>{/if}
      {#if progress}
        <div><h3>Your progress on this song</h3><div class="scroll"><table>
          <thead><tr>{#each ["When", "File", "Overall"].concat(PART_NAMES.map((x: any) => x[1])) as h (h)}<th>{h}</th>{/each}</tr></thead>
          <tbody>{#each progress as x, i (i)}<tr><td class="num">{new Date(x.date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td><td>{x.name}</td><td class="num">{x.score + "%"}</td>{#each PART_NAMES as [k] (k)}<td class="num">{x.parts ? x.parts[k] + "%" + delta(progress, i, k, x.parts[k]) : "–"}</td>{/each}</tr>{/each}</tbody>
        </table></div></div>
      {:else}<p class="small">Upload your export again after each build step to see your progress here, part by part.</p>{/if}
      <div class="row"><button class="btn cool" onclick={() => logScore(c.score)}>Log this score in my practice log</button></div>
      {#if c.fixes.length}
        <div class="layers">{#each c.fixes.slice(0, 8) as f, i (i)}<div class="layer" style={"border-left-color:" + (i < 3 ? "var(--accent)" : "var(--cool)")}><h3>{`${i + 1}. ${f.area}: ${f.gap}`}</h3><p>{f.fix}</p></div>{/each}</div>
      {:else}<p class="tip">No big gaps found. Now make it yours: change the melody or one sound.</p>{/if}
      {@const d = c.bandRows.map((r: any) => parseFloat(r[3]))}
      {@const worst = d.reduce((bi: number, v: number, i: number) => Math.abs(v) > Math.abs(d[bi]) ? i : bi, 0)}
      <div class="bchart">
        <h3>Band by band: your mix against the reference</h3>
        <p class="tip">{Math.abs(d[worst]) >= 1.5 ? `Biggest gap: your ${nm(c.bandRows[worst]).toLowerCase()} band is ${Math.abs(d[worst]).toFixed(1)} dB too ${d[worst] < 0 ? "quiet" : "loud"}. Fix that one first, then export again and compare.` : "All six bands are within 1.5 dB of the reference, so your tonal balance matches."}</p>
        {#each c.bandRows as r, i (i)}
          {@const v = d[i]}{@const w = Math.min(50, Math.abs(v) / 12 * 50)}{@const col = Math.abs(v) < 1.5 ? "var(--good)" : Math.abs(v) < 3 ? "var(--warn)" : "var(--accent)"}
          <div class="brow"><span>{nm(r)}</span><div class="btrack"><i style={`left:${v < 0 ? 50 - w : 50}%;width:${Math.max(w, 0.8)}%;background:${col}`}></i></div><span class="num">{Math.abs(v) < 1.5 ? "on target" : `${Math.abs(v).toFixed(1)} dB too ${v < 0 ? "quiet" : "loud"}`}</span></div>
        {/each}
        <p class="why">The center line is the reference. Bars to the left mean you have less of that band; to the right, more. Green is within 1.5 dB.</p>
      </div>
      <h3>Side by side</h3>{@render tbl(["", "Reference", "Yours", "Gap"], c.rows)}
      {@render tbl(["Band", "Reference", "Yours", "Gap"], c.bandRows)}
      <h3>Drums (top: reference, bottom: yours)</h3>
      <Rack rows={c.drumRows.flatMap((x: any) => [{ name: x.name, steps: x.r }, { name: "yours", steps: x.m }])} />
      <p class="small">Press Ask the coach in the corner about any of these. It can see your comparison.</p>
    {/if}
  </div>
</section>
