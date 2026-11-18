<!-- Sounds and mix: samples to grab, a shopping list (legacy samplesPanel). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  import { fold } from "../lib/ui/fold";
  const { sampleList, genreOf } = domain as any;
  const a = $derived(teardown.result as any);
  const list = $derived(sampleList(a, genreOf(a)) as any[]);
  const txt = $derived(list.map(x => `${x.type}: search "${x.q}"  →  save to samples\\${x.folder}`).join("\n"));
  let copied = $state(false), fallback = $state(false);
</script>

<section class="panel" data-group="sound">
  <h2>Samples to grab</h2>
  <p class="small">{`A shopping list for this song (${Math.round(a.bpm)} BPM, ${a.key}). Each search opens in a new tab. Before downloading, check what's already in your library: your NEWGEN kit covers most drums.`}</p>
  <div class="layers">
    {#each list as x, i (i)}
      <div class="layer" {@attach fold({ open: i === 0, head: "h3" })}>
        <h3>{x.type}</h3>
        <p><b>Search: </b><span class="mono">{x.q}</span></p>
        <p>{x.why}</p>
        <div class="row" style="gap:6px">
          <a href={"https://splice.com/sounds/search?q=" + encodeURIComponent(x.q)} target="_blank" rel="noopener" class="plug">Splice</a>
          <a href={"https://www.looperman.com/loops?keys=" + encodeURIComponent(x.q)} target="_blank" rel="noopener" class="plug">Looperman (free)</a>
          <a href={"https://www.youtube.com/results?search_query=" + encodeURIComponent("free " + x.q + " pack")} target="_blank" rel="noopener" class="plug">Free packs on YouTube</a>
        </div>
        <p class="small">{"Save to: samples\\" + x.folder + ". " + x.tip}</p>
      </div>
    {/each}
  </div>
  <p class="tip">Only download from the creator's own page, Splice, Looperman, BandLab Sounds or a producer's official link. Skip anything that asks for a password-protected .rar or an .exe: that's how people get phished.</p>
  <div class="row"><button class="btn" onclick={() => navigator.clipboard.writeText(txt).then(() => { copied = true; }, () => { fallback = true; })}>{copied ? "Copied" : "Copy shopping list"}</button></div>
  {#if fallback}<textarea readonly style="height:120px">{txt}</textarea>{/if}
</section>
