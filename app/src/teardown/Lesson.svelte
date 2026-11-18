<!-- Build it (example teardown only): the short practice plan (legacy render() "lesson"). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { domain } from "../lib/domain";
  const { GENRES, genreOf, fmtT } = domain as any;
  const a = $derived(teardown.result as any);
  const g = $derived(GENRES[genreOf(a)]);
  const drop = $derived(a.sections.find((s: any) => s.label === "Drop") || a.sections[0]);
  const q = $derived((a.title ? a.title + " " : "") + g.search);
</script>

<section class="panel lesson" data-group="build">
  <h2>Your practice plan</h2>
  <ol>
    <li><b>Setup (5 min). </b>{`New project, tempo ${a.bpm}, scale lock ${a.key}. Drag the song into the Playlist as a reference track.`}</li>
    <li><b>Drums (20 min). </b>Copy the 16-step pattern above. Loop 1 bar until it grooves with the reference.</li>
    <li><b>Bass + chords (20 min). </b>{`Add bass, then 4 chords in ${a.key}. Use Mix Matcher's Camelot code ${a.camelot} to find songs that mix with it.`}</li>
    <li><b>{"Rebuild 8 bars of the " + drop.label + " (30 min). "}</b>{`It starts at bar ${drop.startBar + 1} (${fmtT(drop.start)}). Don't copy it exactly; get the feel, then change one thing to make it yours.`}</li>
    <li><b>Export and share. </b>File → Export → MP3, then send it to your mentor and ask for one fix.</li>
  </ol>
  <p class="small">Find a follow-along video: <a href={"https://www.youtube.com/results?search_query=" + encodeURIComponent(q)} target="_blank" rel="noopener">{"search YouTube for “" + q + "”"}</a></p>
</section>
