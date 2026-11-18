<!-- The practice-session pill, bottom left (legacy buildSession). -->
<script lang="ts">
  import { session } from "../lib/state/session.svelte";
  import { domain } from "../lib/domain";
  let goal = $state("");
  const startCompose = () => { goal = session.defGoal(); session.composing = true; session.msg = ""; session.ticked = false; };
</script>

<div class="sess" class:idle={!session.running} role="region" aria-label="Practice session timer">
  {#if session.running}
    <b class="mono stime">{domain.fmtT(session.left)}</b><span class="sgoal">{session.running.goal}</span>
    <button class="btn" type="button" aria-label="End the session and log it" onclick={() => session.end()}>End</button>
  {:else if session.composing}
    <span class="small">One goal:</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" bind:value={goal} aria-label="One goal for this session" autofocus>
    {#each [15, 25, 45] as m (m)}<button class={m === 25 ? "btn primary" : "btn"} type="button" onclick={() => session.start(goal.trim().slice(0, 120) || "Practice", m)}>{m + " min"}</button>{/each}
    <button class="btn" type="button" onclick={() => { session.composing = false; }}>Cancel</button>
  {:else}
    <button class="btn" type="button" title="Start a timed practice session" onclick={startCompose}>⏱ Session</button>
    {#if session.msg}<span class="small" role="status">{session.msg}</span>{/if}
    {#if session.lastRef && /^Logged/.test(session.msg)}<button class="btn cool" type="button" onclick={() => session.tickOff()}>{`Tick off step ${session.lastRef.step + 1}`}</button>
    {:else if session.ticked}<button class="btn cool" type="button" disabled>✓ Ticked off</button>{/if}
  {/if}
</div>
