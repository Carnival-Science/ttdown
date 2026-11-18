<!-- Full-song MIDI (.zip) and the reference WAV lined up to bar 1 (legacy songMidiButton / refWavButton). -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  import { bufferOf } from "../lib/engine";
  import { saveWithNote, safeName } from "../lib/files/download";
  let { kind, label }: { kind: "midi" | "ref"; label?: string } = $props();
  const a = $derived(teardown.result);
  let note = $state("");
  async function midi() { note = await saveWithNote(`${safeName(a.title, "song")} - full song MIDI ${Math.round(a.bpm)} BPM.zip`, domain.zipStore(domain.songMidiFiles(a)), "application/zip", "Saved. Unzip it. Each file is one part and starts at bar 1. Put the lined-up song (.wav) at bar 1 too and they match."); }
  const fd = $derived(a.firstDown || 0);
  const how = $derived(Math.abs(fd) < 0.005 ? "It already starts on a downbeat." : fd < 0 ? `It has ${Math.round(-fd * 1000)} ms of silence added at the start so bar 1 lands on the first downbeat.` : `The first ${Math.round(fd * 1000)} ms (before the first downbeat) is trimmed so bar 1 lands on the downbeat.`);
  async function wav() {
    note = "Preparing the file…"; await new Promise(r => setTimeout(r, 30));
    const r = await saveWithNote(`${safeName(a.title, "song")} - reference lined up to bar 1.wav`, domain.alignedWav(a), "audio/wav", "Saved. " + how);
    note = r;
  }
</script>

{#if kind === "midi"}
  <span class="row" style="gap:8px"><button class="btn primary" type="button" onclick={midi}>{label || "Download the song as MIDI (.zip)"}</button><span class="small" role="status">{note}</span></span>
{:else if !bufferOf(a)}
  <p class="small">To get the song lined up to bar 1, upload the MP3 again in Teardown (saved teardowns don't keep the audio).</p>
{:else}
  <span class="row" style="gap:8px"><button class="btn" type="button" onclick={wav}>Download the song lined up to bar 1 (.wav)</button><span class="small">{note}</span></span>
{/if}
