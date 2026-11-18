<!-- A small piano-roll picture of notes (legacy pianoRoll()): 1 step = a 16th; thick lines are bars, thin lines beats. -->
<script lang="ts">
  import { engine } from "../../engine";
  // Standard pitch naming: MIDI note 60 is middle C, C4 (DAWs differ by an octave or two; this is the common scientific convention).
  const noteName = (m: number) => (engine.NAMES[((m % 12) + 12) % 12] ?? "?") + (Math.floor(m / 12) - 1);
  interface N { t: number; dur: number; midi: number; glide?: boolean }
  let { notes, total, label = noteName, aria = "Piano roll" }: { notes: N[]; total: number; label?: (m: number) => string; aria?: string } = $props();
  const geo = $derived.by(() => {
    const ms = notes.map(n => n.midi), lo = Math.min(...ms) - 1, hi = Math.max(...ms) + 1, rows = hi - lo + 1;
    const rh = Math.max(6, Math.min(11, Math.floor(130 / rows))), lw = 36, sw = 9;
    return { lo, hi, rh, lw, sw, W: lw + total * sw, H: rows * rh, used: new Set(ms), keys: Array.from({ length: rows }, (_, i) => hi - i) };
  });
</script>

<svg viewBox={`0 0 ${geo.W} ${geo.H}`} role="img" aria-label={aria} style="width:100%;height:auto;display:block;background:#0d0e11;border:1px solid #000;border-radius:8px">
  {#each geo.keys as m (m)}
    {@const y = (geo.hi - m) * geo.rh}
    <rect x={geo.lw} {y} width={total * geo.sw} height={geo.rh} fill={[1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12) ? "#14151a" : "#1b1d23"} />
    {#if geo.used.has(m)}<text x="3" y={y + geo.rh - 2} font-size={Math.min(9, geo.rh)} fill="#b3b2ab" font-family="JetBrains Mono, monospace">{label(m)}</text>{/if}
  {/each}
  {#each Array.from({ length: Math.floor(total / 4) + 1 }, (_, i) => i * 4) as s (s)}
    <line x1={geo.lw + s * geo.sw} y1="0" x2={geo.lw + s * geo.sw} y2={geo.H} stroke={s % 16 === 0 ? "#4a4d57" : "#2c2f37"} stroke-width={s % 16 === 0 ? 1.2 : 0.6} />
  {/each}
  {#each notes as n, i (i)}
    <rect x={geo.lw + n.t * geo.sw + 0.5} y={(geo.hi - n.midi) * geo.rh + 0.5} width={Math.max(3, n.dur * geo.sw - 1.5)} height={geo.rh - 1} rx="1.5" fill={n.glide ? "#79a8ff" : "#ff7a1a"} />
  {/each}
</svg>
