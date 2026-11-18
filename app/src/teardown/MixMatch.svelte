<!-- Overview: songs from the user's library that mix with this one (legacy mixMatchPanel). -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  const { LIB } = domain;
  const a = $derived(teardown.result);
  const rows = $derived.by(() => {
    const n = parseInt(a.camelot, 10), L = a.camelot.slice(-1);
    const rel = (c: string): [number, string] | null => { if (!c) return null; const cn = parseInt(c, 10), cl = c.slice(-1), up = (cn - n + 12) % 12; if (c === a.camelot) return [3, "same key"]; if (cn === n) return [2, "relative key (mood change)"]; if (cl === L && up === 1) return [2, "one step up (lifts the energy)"]; if (cl === L && up === 11) return [2, "one step down (smooth)"]; return null; };
    const out: { t: string; ar: string; bpm: number; cam: string; why: string; pct: number; note: string; s: number }[] = [];
    (LIB as [string, string, number, string][]).forEach(([t, ar, bpm, cam]) => { const r = rel(cam); if (!r || !bpm) return; let eff = bpm, note = ""; if (Math.abs(bpm * 2 - a.bpm) / a.bpm < 0.06) { eff = bpm * 2; note = " (half-time)"; } else if (Math.abs(bpm / 2 - a.bpm) / a.bpm < 0.06) { eff = bpm / 2; note = " (double-time)"; }
      const pct = (eff - a.bpm) / a.bpm; if (Math.abs(pct) > 0.06) return; out.push({ t, ar, bpm, cam, why: r[1], pct, note, s: r[0] * 10 - Math.abs(pct) * 100 }); });
    return out.sort((p, q) => q.s - p.s);
  });
</script>

<section class="panel" data-group="overview">
  <div class="row" style="justify-content:space-between"><h2>Mixes with this (from your library)</h2><a class="btn" style="text-decoration:none" href="https://claude.ai/artifact/EUe4N4DjF5aGnwzU8HeXu3" target="_blank" rel="noopener">Open Mix Matcher</a></div>
  <p class="small">{rows.length ? `${rows.length} of your ${LIB.length} tracks sit within 6% of ${a.bpm} BPM in a key that blends with ${a.camelot}. Good for DJ transitions, and as extra references for the same vibe.` : `None of your ${LIB.length} tracks sit within 6% of ${a.bpm} BPM in a key that blends with ${a.camelot}. If the key was low confidence, check it by ear above and this list will update.`}</p>
  {#if rows.length}
    <div class="scroll"><table>
      <thead><tr>{#each ["Song", "Artist", "BPM", "Key", "Why it mixes"] as h (h)}<th>{h}</th>{/each}</tr></thead>
      <tbody>{#each rows.slice(0, 12) as r, i (i)}<tr><td><b>{r.t}</b></td><td>{r.ar}</td><td class="num">{`${r.bpm}${r.note} (${r.pct >= 0 ? "+" : ""}${(r.pct * 100).toFixed(1)}%)`}</td><td class="num">{r.cam}</td><td>{r.why}</td></tr>{/each}</tbody>
    </table></div>
  {/if}
</section>
