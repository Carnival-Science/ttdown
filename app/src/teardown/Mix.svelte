<!-- Sounds and mix: EQ and mix moves, starting settings (legacy render() "mix"). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  import { fold } from "../lib/ui/fold";
  const { mixNotes, MIX_EX, MIX_SHEET } = domain as any;
  const a = $derived(teardown.result as any);
</script>

<section class="panel" data-group="sound">
  <h2>EQ and mix moves</h2>
  <div class="layers">
    {#each mixNotes(a) as m, i (i)}
      <div class="layer" style="border-left-color:var(--cool)" {@attach fold({ open: i === 0, head: "h3" })}>
        <h3>{m.t}</h3><p>{m.d}</p>
        {#if MIX_EX[m.t]}<p class="small"><b>Example: </b>{MIX_EX[m.t]}</p>{/if}
        <div><span class="plug">{m.plug}</span></div>
      </div>
    {/each}
  </div>
  <div class="fold-wrap" {@attach fold({ open: false, head: "h3", summary: "Rule-of-thumb EQ, effects and levels for every sound" })}>
    <h3>Starting settings for each sound</h3>
    <p class="small">Rule-of-thumb starting points in Fruity Parametric EQ 2 and stock effects. Set them, then adjust by ear against the reference.</p>
    <div class="scroll"><table><thead><tr>{#each ["Sound", "EQ", "Effects", "Level"] as h (h)}<th>{h}</th>{/each}</tr></thead>
      <tbody>{#each MIX_SHEET as r, i (i)}<tr>{#each r as c, j (j)}{#if j === 0}<td><b>{c}</b></td>{:else}<td>{c}</td>{/if}{/each}</tr>{/each}</tbody></table></div>
  </div>
</section>
