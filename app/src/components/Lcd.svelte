<!-- The LCD readout: tempo, Camelot key and 16 LEDs that step through the kick pattern at the song's tempo (legacy setLCD). -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  const a = $derived(teardown.result);
  let lit = $state(-1);
  $effect(() => {
    const bpm = a.bpm; lit = -1;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0; const t = setInterval(() => { lit = i % 16; i++; }, 60000 / bpm / 4);
    return () => clearInterval(t);
  });
</script>

<div class="lcd" aria-label="Current song tempo and key">
  <div class="lcd-read"><span id="lcd-bpm">{Number(a.bpm).toFixed(1)}</span><small>BPM</small></div>
  <div class="lcd-read"><span id="lcd-key">{a.camelot}</span><small>KEY</small></div>
  <div class="leds" id="leds" aria-hidden="true">{#each a.pattern.kick as k, i (i)}<i class={(k ? "k" : "") + (lit === i ? " lit" : "")}></i>{/each}</div>
</div>
