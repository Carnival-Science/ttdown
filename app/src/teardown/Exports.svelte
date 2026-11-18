<!-- Export: analysis data always; the MIDI parts and the song lined up to bar 1 only when the bar grid can be trusted. TimeMap decides
     (three states, docs/TIMEMAP.md): allowed, needs-confirmation (the analyzer's 4/4 and first downbeat are assumptions: listen with the
     beat clicks, then confirm), or refused (tempo changes or drift: no single fixed grid fits). A tempo you corrected makes the results
     stale, so those exports are blocked too. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  import { gridOf } from "../lib/timeline/grid";
  import { bufferOf } from "../lib/engine";
  import { TimingStore } from "../lib/persistence/timing";
  import { saveFile, safeName } from "../lib/files/download";

  const { zipStore, songMidiFiles, alignedWav, tdId } = domain as any;
  const a = $derived(teardown.result as any);
  const map = $derived((gridOf(a) as any).map);
  const stale = $derived(!!a.bpmFixed);
  let confirmedFor = $state(""), downbeatOk = $state(false), meterOk = $state(false), note = $state("");
  const id = $derived(tdId(a) + "|" + (map ? map.fingerprint() : ""));
  const confirmed = $derived(confirmedFor === id);
  $effect(() => { void id; downbeatOk = false; meterOk = false; note = ""; });
  const elig = $derived.by(() => { try { return (confirmed ? map.confirmDownbeat().confirmMeter() : map).exportEligibility(); } catch { return { state: "refused", reasons: ["no-grid"], needs: [], caveats: [] }; } });
  const REASONS: Record<string, string> = {
    "tempo-changes": "The tempo changes during the track, so one fixed bar grid can't line up with it.",
    "tempo-not-constant": "The tempo isn't steady enough for one fixed bar grid.",
    "tempo-drift": "The tempo drifts: one steady tempo would miss the tracked beats by more than the allowed margin somewhere.",
    "meter-not-4/4": "The meter isn't 4/4, and exports only support four beats per bar.",
    "meter-ambiguous": "The meter is ambiguous.", "meter-unsupported": "The meter isn't supported.", "no-grid": "There is no usable bar grid.",
  };
  const blocked = $derived(stale || elig.state === "refused");
  const canExport = $derived(!blocked && (elig.state === "allowed" || confirmed));
  const buffer = $derived(bufferOf(a));
  const base = $derived(safeName(a.title, "song"));
  async function run(fn: () => Promise<string>) { try { note = await fn(); } catch (e) { note = "Couldn't save the file" + ((e as Error)?.message ? ": " + (e as Error).message.slice(0, 80) : "."); } }
  const data = () => run(async () => { await saveFile(`${base} - analysis.json`, JSON.stringify(TimingStore.forStorage(a), null, 1), "application/json"); return "Saved the analysis data, including the tracked beat times."; });
  const midi = () => run(async () => { await saveFile(`${base} - full song MIDI ${Math.round(a.bpm)} BPM.zip`, zipStore(songMidiFiles(a)), "application/zip"); return "Saved. Unzip it: each file is one detected part and starts at bar 1. Put the song lined up to bar 1 (.wav) at bar 1 too and they match."; });
  const wav = () => run(async () => {
    note = "Preparing the file…"; await new Promise(r => setTimeout(r, 30));
    await saveFile(`${base} - reference lined up to bar 1.wav`, alignedWav(a), "audio/wav");
    const fd = a.firstDown || 0;
    return "Saved. " + (Math.abs(fd) < 0.005 ? "It already starts on a downbeat." : fd < 0 ? `It has ${Math.round(-fd * 1000)} ms of silence added at the start so bar 1 lands on the first downbeat.` : `The first ${Math.round(fd * 1000)} ms (before the first downbeat) is trimmed so bar 1 lands on the downbeat.`);
  });
</script>

<section class="panel" id="exports" aria-labelledby="export-h">
  <h2 id="export-h">Export</h2>
  <div class="row"><button class="btn" type="button" onclick={data}>Analysis data (.json)</button><span class="small">Everything found, with the tracked beat times. Always available.</span></div>

  <h3>Bar-aligned files</h3>
  {#if stale}
    <p class="notice">Blocked: you corrected the tempo, so bars, chords and drum positions no longer match it. Upload the track again to export.</p>
  {:else if elig.state === "refused"}
    <p class="notice">Blocked: {(elig.reasons as string[]).map(r => REASONS[r] || r).join(" ")} Files written on one fixed grid would drift away from the song.</p>
  {:else if !canExport}
    <div class="notice confirm">
      <p><b>Check the bar lines before exporting.</b> The analyzer assumes the first downbeat it chose is bar 1 and that the track is in 4/4. It can be wrong about either, and a wrong grid puts every exported note in the wrong place. Use “Play with beat clicks” in the player: the first, higher click of each bar should land on a downbeat.</p>
      <label><input type="checkbox" bind:checked={downbeatOk}> The higher click lands on bar 1 and on every following downbeat</label>
      <label><input type="checkbox" bind:checked={meterOk}> The track is in 4/4</label>
      <button class="btn primary" type="button" disabled={!(downbeatOk && meterOk)} onclick={() => { confirmedFor = id; }}>Confirm and unlock these exports</button>
    </div>
  {:else}
    <p class="small">Bar lines confirmed by you for this session.</p>
  {/if}
  {#each elig.caveats as c (c)}<p class="small">{c}</p>{/each}
  <div class="row">
    <button class="btn primary" type="button" disabled={!canExport} onclick={midi}>Download the song as MIDI (.zip)</button>
    <button class="btn" type="button" disabled={!canExport || !buffer} onclick={wav}>Download the song lined up to bar 1 (.wav)</button>
  </div>
  {#if canExport && !buffer}<p class="small">The lined-up audio needs the track itself: upload it again (saved teardowns don't keep the audio).</p>{/if}
  <p class="small" role="status">{note}</p>
</section>
