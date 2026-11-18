<!-- The coach: floating button and drawer (legacy buildCoach). Optional runtime: dictation shows a "Speak" button only when available. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { coach } from "../lib/state/coach.svelte";
  import { app } from "../lib/state/app.svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { useCap } from "../lib/runtime/claude";
  let q: HTMLTextAreaElement, logEl: HTMLDivElement;
  const ctx = $derived.by(() => { void app.route; void teardown.result; void teardown.example; return coach.isOpen ? coach.context() : null; });
  $effect(() => { void coach.focusSignal; if (coach.isOpen) queueMicrotask(() => q?.focus()); });
  $effect(() => { void coach.log.length; const last = coach.log[coach.log.length - 1]; void last?.a; if (logEl) logEl.scrollTop = logEl.scrollHeight; });
  // dictation (optional)
  let dictation: any = $state(null), listening = $state(false), micHidden = $state(true);
  $effect(() => { if (!coach.isOpen || dictation) return; void (async () => { const d = await useCap("dictation"); if (!d) return; dictation = d; micHidden = false;
    d.onPartial(({ text }: any) => { coach.hint = text; }); d.onFinal(({ text }: any) => { coach.question = (coach.question ? coach.question.trimEnd() + " " : "") + text; coach.hint = ""; });
    d.onState(({ state }: any) => { listening = state === "listening"; if (!listening) coach.hint = ""; }); })(); });
  const mic = () => { if (!dictation) return; if (listening) dictation.stop().catch(() => {}); else dictation.start().catch((e: any) => { if (e && e.code === "not_granted") micHidden = true; }); };
</script>

<svelte:window onkeydown={e => { if (e.key === "Escape" && coach.isOpen) coach.close(); }} />
<button class="coach-fab" type="button" aria-haspopup="dialog" aria-expanded={(coach.isOpen)} onclick={() => coach.toggle()}>{coach.isOpen ? "Hide coach" : "Ask the coach"}</button>
<div class="coach-drawer" role="dialog" aria-label="Production coach" hidden={!coach.isOpen}>
  <div class="row" style="justify-content:space-between"><h2>Coach</h2><button class="btn" type="button" aria-label="Close the coach" onclick={() => coach.close()}>Close</button></div>
  {#if ctx}
    <span class="tag">{ctx.tag}</span>
    <div class="row" style="gap:6px">{#each ctx.quick as t (t)}<button class="btn" type="button" style="padding:5px 9px;font-size:.8rem" onclick={() => { coach.question = t; void coach.ask(); }}>{t}</button>{/each}</div>
  {/if}
  <div class="coach-log" role="log" aria-live="polite" bind:this={logEl}>
    {#each coach.log as qa, i (i)}<div class="qa"><p class="small q">{qa.q}</p><div class="answer">{qa.a}</div></div>{/each}
  </div>
  <textarea id="coach-q" placeholder="Ask anything about FL Studio or this song. Ctrl+Enter to send." aria-label="Question for your coach" bind:this={q} bind:value={coach.question} onkeydown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void coach.ask(); } }}></textarea>
  <div class="row">
    <button class="btn primary" type="button" disabled={coach.busy} onclick={() => coach.ask()}>Ask</button>
    <button class="btn" type="button" hidden={micHidden} onclick={mic}>{listening ? "■ Stop listening" : "Speak"}</button>
    <span class="small">{coach.hint}</span>
  </div>
</div>
