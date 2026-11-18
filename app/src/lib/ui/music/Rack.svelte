<!-- A one-bar 16-step drum grid, drawn like FL's Piano roll (legacy rack()/rackRow()). Rows are editable when `onEdit` is set. -->
<script lang="ts">
  import { domain } from "../../domain";
  interface Row { name: string; steps: boolean[]; ghost?: boolean[] | null; onEdit?: (i: number, on: boolean) => void }
  let { rows }: { rows: Row[] } = $props();
  const { posOf, stepsText } = domain;
  const cls = (r: Row, i: number) => "step" + (r.steps[i] ? " on" : r.ghost && r.ghost[i] ? " ghost" : "") + (i % 4 === 0 ? " beat" : "");
</script>

<div class="rack roll">
  <div class="rack-row ruler"><span>Beat</span><div class="steps">{#each Array.from({ length: 16 }, (_, i) => i) as i (i)}<div class={"tick" + (i % 4 === 0 ? " b" : "")}>{i % 4 === 0 ? String(i / 4 + 1) : ""}</div>{/each}</div></div>
  {#each rows as r, ri (ri)}
    <div class="rack-row">
      <span>{r.name}</span>
      <div class={"steps" + (r.onEdit ? " edit" : "")} aria-label={r.name + " " + stepsText(r.steps)}>
        {#each r.steps as on, i (i)}
          {#if r.onEdit}
            <button type="button" class={cls(r, i)} aria-label={`${r.name} at beat ${posOf(i)}`} aria-pressed={(!!on)} onclick={() => r.onEdit!(i, !on)}></button>
          {:else}
            <div class={cls(r, i)}></div>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>
