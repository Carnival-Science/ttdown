<!-- Sounds and mix: layers and FL Studio plugins (legacy render() "layers / plugins"). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  import { fold } from "../lib/ui/fold";
  const { GENRES, genreOf, REF } = domain as any;
  const a = $derived(teardown.result as any);
  const g = $derived(GENRES[genreOf(a)]);
  const layers = $derived([
    { name: "Drums", what: g.drums, plugs: ["FPC or Channel Rack samples", "Fruity Parametric EQ 2", a.rhythm.fourFloor ? "Fruity Limiter (sidechain the bass to the kick)" : "Fruity Compressor"], how: ["Start with kick + clap only and get them hitting together.", "Add hats last, at lower volume.", "Group all drums to one mixer track so you can EQ and compress them together."] },
    { name: "Bass", what: g.bass + `. Write it in ${a.key} (scale lock on).`, plugs: a.balance[0] > REF[0] * 1.2 ? ["3x Osc (sine) or FL 808 for the sub", "Sytrus or Vital (free) for the mid bass"] : ["Sytrus or Vital (free)", "Fruity Fast Dist for grit"], how: ["Match bass notes to the kick rhythm first.", "Keep bass mono and centered.", "Sidechain it to the kick if they muddy each other."] },
    { name: "Chords and pads", what: `Chords in ${a.key}. Try the relative key ${a.relKey} for a mood shift.`, plugs: ["FLEX pads or FL Keys", "Harmless (soft synth pads)", "Fruity Reeverb 2", "Fruity Parametric EQ 2 (high-pass at 150 Hz)"], how: ["Open the Piano Roll (F7) and set the scale to " + a.key + ": arrow menu top-left → View → Helpers → Scale highlighting (newer FL versions also have Snap to scale).", "Play 4 chords, 1 bar each, and loop them.", "Use long attack and release so pads swell."] },
    { name: "Lead / hook", what: "The part you hum. Keep it short and repeat it.", plugs: ["Sytrus or Vital (free)", "FLEX presets", "Fruity Delay 3"], how: ["Write a 2-bar phrase using notes from your chords.", "Copy it, change the last 2 notes for the answer phrase.", "Add delay at 1/8 or 3/16 synced to tempo."] },
    { name: "Vocals, chops and FX", what: "Found sounds, vocal chops, risers and impacts for transitions.", plugs: ["Edison (record and chop)", "Slicex", "Pitcher or NewTone", "Gross Beat"], how: ["Record your own phone audio and chop one word into a rhythm.", "Put a riser in the 4–8 bars before each Drop.", "Use Gross Beat stutter on the last bar of a Build."] },
  ]);
</script>

<section class="panel" data-group="sound">
  <h2>Layers and FL Studio plugins</h2>
  <p class="small">Build in this order, top to bottom. Everything here is in your FL Studio Signature Bundle (Gross Beat, Harmless, Low Lifter, Pitcher and NewTone included). Vital is a free extra.</p>
  <div class="layers">
    {#each layers as L, i (L.name)}
      <div class="layer" {@attach fold({ open: i === 0, head: "h3" })}>
        <h3>{L.name}</h3><p>{L.what}</p>
        <div class="row" style="gap:6px">{#each L.plugs as p (p)}<span class="plug">{p}</span>{/each}</div>
        <ul>{#each L.how as h (h)}<li>{h}</li>{/each}</ul>
      </div>
    {/each}
  </div>
</section>
