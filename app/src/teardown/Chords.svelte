<!-- Song map: chords, the main loop, bar-by-bar grid per section, and "Check chords by ear" (legacy chordsPanel + chordChecker). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { player, nav } from "../lib/state/player.svelte";
  import { domain } from "../lib/domain";
  import { helpText } from "../lib/ui/fold";
  const { keyChords, chordNotes, keyInfo, chordFromDegree, recomputeLoop } = domain as any;
  const a = $derived(teardown.result as any);
  const ex = $derived(teardown.example);
  const ch = $derived(a.chords), bars = $derived((ch.bars || []) as string[]);
  const inKey = $derived(keyChords(a.key) as Set<string>);
  const count = $derived.by(() => { const c: Record<string, number> = {}; bars.forEach(x => { if (x && x !== "–") c[x] = (c[x] || 0) + 1; }); return c; });
  const shaky = (c: string) => !!c && c !== "–" && (!inKey.has(c) || count[c]! <= 2);
  // hear one bar: loop it on the Song map's player with only the detected chords playing on top (legacy chordsPanel/chordChecker)
  const loopBar = (b: number, rate: number) => { const st = (a.firstDown || 0) + b * a.barSec; nav.goMap(() => { player.loopRange?.(st, st + a.barSec, rate); player.overlayOnly?.("chords"); }); };
  const secs = $derived(a.sections.map((s: any, i: number) => {
    const list = bars.slice(s.startBar, s.startBar + s.bars), tally: Record<string, number> = {}; list.forEach(c => { if (c && c !== "–" && !shaky(c)) tally[c] = (tally[c] || 0) + 1; });
    const top = Object.keys(tally).sort((x, y) => tally[y]! - tally[x]!).slice(0, 3), empty = list.filter(c => !c || c === "–").length;
    const sum = (top.length ? `Mostly ${top.join(", ")}` : "No clear chords (drums or effects only)") + (empty > s.bars / 2 ? " · mostly no chords" : "");
    const end = Math.min(s.startBar + s.bars, bars.length), groups: { b: number; k: string; n: number }[] = [];
    for (let b = s.startBar; b < end; b += 4) { const k = bars.slice(b, Math.min(b + 4, end)).join(" "), g = groups[groups.length - 1]; if (g && g.k === k && b + 4 <= end) g.n++; else groups.push({ b, k, n: 1 }); }
    const open = i === 0 || (s.label === "Drop" && !a.sections.slice(0, i).some((x: any) => x.label === "Drop"));
    return { s, sum, end, groups, open };
  }));
  // check chords by ear
  const opts = $derived.by(() => { const k = keyInfo(a); return Array.from({ length: 7 }, (_, d) => chordFromDegree(k, d, false).name as string); });
  const n = $derived(Math.min(bars.length, 96));
  let cur = $state(0);
  const checks = $derived((a.chordChecks || {}) as Record<string, string>);
  function set(name: string, mark: string) { const b = cur; teardown.replace(x => { const y: any = x; y.chords.bars[b] = name; y.chordChecks = { ...(y.chordChecks || {}), [b]: mark }; recomputeLoop(y); }); player.overlayRestart?.(); }
  function ok() { const b = cur; teardown.replace(x => { const y: any = x; y.chordChecks = { ...(y.chordChecks || {}), [b]: "ok" }; }); if (cur < n - 1) cur++; }
  const go = () => loopBar(cur, 0.75);
</script>

<section class="panel" data-group="map">
  <h2>Chords</h2>
  {#if ch.loop}
    <div class="chuse">
      <p><b>Use this: </b>{`the main 4-bar chord loop (heard ${ch.loopCount}×). Play one chord per bar; the small letters are the 3 notes to press.`}</p>
      <div class="chcards">{#each ch.loop as c, i (i)}<div class="chcard"><span class="chbar">{"Bar " + (i + 1)}</span><b>{c}</b><small>{chordNotes(c)}</small></div>{/each}</div>
    </div>
  {:else}
    <p class="small">No clear repeating 4-bar loop was found. Use the section that sounds best below, or Check my chords.</p>
  {/if}
  <h3 style="margin:14px 0 4px">Bar by bar, per section</h3>
  <p class="small">Every square is one bar, 4 bars to a row. Click a square to hear that bar with the chord played over it.</p>
  <div class="row chlegend"><span><i class="sw ok"></i>chord heard clearly</span><span><i class="sw shaky"></i>{"? = shaky guess (rare, or outside " + a.key + ")"}</span><span><i class="sw none"></i>· = no clear chord</span></div>
  <div class="chsecs">
    {#each secs as x, i (i)}
      <details class="chsec" open={x.open}>
        <summary><b>{x.s.label}</b><span class="small mono">{`bars ${x.s.startBar + 1}–${x.s.startBar + x.s.bars}`}</span><span class="small">{x.sum}</span></summary>
        <div class="chbars">
          {#each x.groups as g (g.b)}
            <div class="chrowwrap">
              {#if g.n > 1}<div class="small mono chrep">{`bars ${g.b + 1}–${g.b + g.n * 4}: these 4 bars repeat ×${g.n}`}</div>{/if}
              <div class="chrow">
                {#each [0, 1, 2, 3] as k (k)}
                  {#if g.b + k < x.end}
                    {@const b = g.b + k}{@const c = bars[b]!}{@const none = !c || c === "–"}{@const sh = shaky(c)}
                    <button type="button" class={"chcell" + (none ? " none" : "") + (sh ? " shaky" : "")} title={none ? `Bar ${b + 1}: no clear chord` : `Bar ${b + 1}: ${c} (${chordNotes(c)})${sh ? " · shaky guess" : ""}. Click to hear this bar.`} onclick={() => loopBar(b, 1)}><span class="chnum">{b + 1}</span><b>{none ? "·" : c + (sh ? "?" : "")}</b></button>
                  {:else}<span></span>{/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </details>
    {/each}
  </div>
  <p class="tip">{`In FL: open your pad's Piano roll, turn on Scale highlighting for ${a.key}, and draw each chord's 3 notes stacked, one bar each. These are estimated from the audio, so check them by ear.`}</p>
  {#if !ex && ch.bars}
    <div class="chcheck">
      <h3>Check chords by ear</h3>
      {#if !teardown.audioURL}<p class="tip">To listen, upload the song again at the top (saved teardowns don't keep the audio).</p>{/if}
      <p class="small" {@attach helpText()}>Click a bar: it loops that bar of the song at 75% with the detected chord playing on top. Press ✓ if it blends in, or pick a different chord until it does. Green = checked, blue = changed by you. Your changes go into the MIDI download and the build plan.</p>
      <div class="row" style="gap:8px">
        <b>{`Bar ${cur + 1}: ${bars[cur]}`}</b>
        <button class="btn cool" type="button" onclick={go}>▶ Loop this bar</button>
        <button class="btn" type="button" onclick={ok}>✓ Sounds right</button>
        <select class="isel" aria-label="Change this bar's chord" value="" onchange={e => { const v = e.currentTarget.value; if (v) set(v, "fixed"); e.currentTarget.value = ""; }}>
          <option value="">Change chord…</option>{#each opts as o (o)}<option value={o}>{o}</option>{/each}<option value="–">No chord</option>
        </select>
      </div>
      <div class="chgrid">
        {#each Array.from({ length: n }, (_, b) => b) as b (b)}
          <button type="button" class={"chchip" + (b === cur ? " sel" : "") + (checks[b] ? " " + checks[b] : "")} aria-label={`Bar ${b + 1}: ${bars[b]}`} onclick={() => { cur = b; go(); }}><small>{String(b + 1)}</small><b>{bars[b]}</b></button>
        {/each}
      </div>
    </div>
  {/if}
</section>
