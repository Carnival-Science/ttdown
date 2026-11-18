<!-- Sounds and mix: the user's samples that fit this song (legacy shelfMatchPanel). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { lab } from "../lib/state/samplelab.svelte";
  import { account } from "../lib/storage/account.svelte";
  import { shelfList, isShelved } from "../lib/storage/data";
  import { domain } from "../lib/domain";
  import { engine } from "../lib/engine";
  const { keyInfo, SFOLDER } = domain as any;
  const NAMES = engine.NAMES as string[];
  const a = $derived(teardown.result as any);
  const rows = $derived.by(() => {
    void account.rev;
    const k = keyInfo(a);
    const items = shelfList().map((x: any) => ({ name: x.suggested || x.name, kind: x.kind || "", note: x.note, bpm: x.bpm, folder: x.folder })).concat(lab.items.filter(it => !isShelved(it)).map((it: any) => ({ name: it.name, kind: it.type || "", note: it.note ? it.note.name : "", bpm: it.bpm, folder: SFOLDER[it.type] })));
    const rate = (x: any) => {
      if (/loop/i.test(x.kind)) { if (!x.bpm) return null; const r = x.bpm / a.bpm; return [1, 0.5, 2].some(m => Math.abs(r / m - 1) < 0.03) ? { s: 3, cls: "ok", t: `tempo fits (${x.bpm} BPM)` } : Math.abs(r - 1) < 0.12 ? { s: 1, cls: "warn", t: `${x.bpm} BPM: stretch it to ${a.bpm}` } : null; }
      if (x.note) { const pc = NAMES.indexOf(String(x.note).replace(/-?\d+$/, "")); if (pc < 0) return null; const d = ((pc - k.root) % 12 + 12) % 12;
        if (d === 0) return { s: 4, cls: "ok", t: `${x.note}: the home note of ${a.key}` }; if (k.sc.includes(d)) return { s: 3, cls: "ok", t: `${x.note}: in key` };
        let up = 1; while (up < 6 && !k.sc.includes((d + up) % 12) && !k.sc.includes(((d - up) % 12 + 12) % 12)) up++;
        return { s: 1, cls: "warn", t: `${x.note}: pitch it ${k.sc.includes((d + up) % 12) ? "up" : "down"} ${up} semitone${up > 1 ? "s" : ""}` }; }
      return /Kick|Snare|Hi-hat|Percussion|FX/i.test(x.kind) ? { s: 2, cls: "", t: "fits any key" } : null;
    };
    return items.map((x: any) => ({ x, r: rate(x) })).filter((o: any) => o.r).sort((p: any, q: any) => q.r.s - p.r.s).slice(0, 18);
  });
</script>

<section class="panel" data-group="sound">
  <h2>Your samples that fit this song</h2>
  {#if rows.length}
    <p class="small">{`From your Sample Lab shelf and anything you've loaded there this visit. Best fits for ${a.bpm} BPM in ${a.key} come first.`}</p>
    <div class="scroll"><table><thead><tr>{#each ["Sample", "Type", "Fit", "Where it lives"] as t (t)}<th>{t}</th>{/each}</tr></thead>
      <tbody>{#each rows as { x, r }, i (i)}<tr><td><b>{x.name}</b></td><td>{x.kind}</td><td><span class={"chip " + r!.cls}>{r!.t}</span></td><td class="mono small">{"samples\\" + (x.folder || "")}</td></tr>{/each}</tbody></table></div>
  {:else}
    <p class="small">Nothing to match yet. In Sample Lab, drop in a kit and press ☆ on the sounds you like. They'll be checked against every song you analyze: 808s and chops by note, loops by tempo.</p>
    <div class="row"><a class="btn" href="#samples" style="text-decoration:none">Open Sample Lab</a></div>
  {/if}
</section>
