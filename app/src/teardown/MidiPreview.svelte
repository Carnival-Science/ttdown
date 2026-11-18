<script lang="ts">
  import PianoRoll from "../lib/ui/music/PianoRoll.svelte";
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  import { saveWithNote, safeName } from "../lib/files/download";
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let { m }: { m: any } = $props();
  const a = $derived(teardown.result);
  let note = $state("");
  async function dl() { note = await saveWithNote(`${safeName(a.title, "song")} - ${m.name} 4 bars ${Math.round(a.bpm)} BPM.mid`, domain.midiBytes(m.notes, a.bpm), "audio/midi", `Saved. In FL: select the ${m.name} channel, F7, small arrow → File → Import MIDI file…`); }
</script>

<div class="midiprev">
  <div class="row" style="justify-content:space-between;gap:8px"><b>MIDI: {m.name}</b><span class="small mono">song bars {m.bars} ({m.from}) · shown as bars 1–4</span></div>
  <div class="midiruler">{#each [1, 2, 3, 4] as n (n)}<span>Bar {n}</span>{/each}</div>
  <PianoRoll notes={m.notes} total={64} />
  <p class="small">{m.drum ? "One row = one hit on the C5 row in FL. Thick lines are bar lines; thin lines are beats." : "Note names are FL's (middle C = C5). Thick lines are bar lines; thin lines are beats."}</p>
  <span class="row" style="gap:8px"><button class="btn" type="button" onclick={dl}>Download {m.name} (4 bars, .mid)</button><span class="small">{note}</span></span>
</div>
