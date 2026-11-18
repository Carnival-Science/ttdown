<!-- Song map: drum pattern (editable) and frequency balance (legacy render() "drums + layers" grid). -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { teardown } from "../lib/state/teardown.svelte";
  import { patternPlayer } from "../lib/audio/pattern.svelte";
  import { domain } from "../lib/domain";
  import Rack from "../lib/ui/music/Rack.svelte";
  const { stepsText, hatFeel, swingText, fmtT, BANDS, REF } = domain as any;
  const a = $derived(teardown.result as any);
  const ex = $derived(teardown.example);
  const gh = $derived(a.pattern.ghost || {});
  // edit one step: the same fix goes into every part of the song where drums play (MIDI download, Check by ear)
  const edited = (lane: string) => (i: number, val: boolean) => teardown.replace(x => {
    const y: any = x; y.patternEdited = true; y.pattern[lane][i] = val; if (y.pattern.ghost && y.pattern.ghost[lane]) y.pattern.ghost[lane][i] = false;
    (y.drumParts || []).forEach((pt: any) => { if (pt.kick.some(Boolean) || pt.snare.some(Boolean)) pt[lane][i] = val; });
  });
  const parts = $derived((a.drumParts || []) as any[]);
  const same = (p: any, q: any) => ["kick", "snare", "hats"].every(k => p[k].join() === q[k].join());
</script>

<div class="grid2" data-group="map">
  <section class="panel">
    <h2>Drum pattern</h2>
    <p class="small">{"One bar, drawn like FL Studio's Piano roll with Snap set to 1/4 beat: 4 beats, 4 squares per beat. Positions are written beat.square, so 2.3 means beat 2, third square. Orange notes hit in most bars; dim ones are ghost notes (softer or only sometimes). Wrong? Click a square to fix it, then use Check by ear in the player above." + (a.pattern.tracked ? ` Found by following the beat through ${a.pattern.bars} bars.` : "")}</p>
    <Rack rows={[{ name: "Kick", steps: a.pattern.kick, onEdit: edited("kick") }, { name: "Snare / clap", steps: a.pattern.snare, ghost: gh.snare, onEdit: edited("snare") }, { name: "Hi-hats", steps: a.pattern.hats, ghost: gh.hats, onEdit: edited("hats") }]} />
    <div class="row"><button class="btn cool" onclick={() => patternPlayer.toggle(a)}>{patternPlayer.on ? "■ Stop" : "▶ Hear this pattern at " + a.bpm + " BPM"}</button></div>
    {#if !ex}<p class="small">{swingText(a)}</p>{/if}
    {#if parts.length >= 2}
      <details class="secdr"><summary class="small">{`Where the drums change (${parts.length} parts)`}</summary>
        {#each parts as s, i (i)}
          {@const none = !s.kick.some(Boolean) && !s.snare.some(Boolean)}{@const sm = same(s, a.pattern)}
          <div class="secx">
            <div class="row" style="gap:8px"><b>{`Bars ${s.startBar + 1}–${s.startBar + s.bars}`}</b><span class="small mono">{"from " + fmtT(Math.max(0, (a.firstDown || 0) + s.startBar * a.barSec))}</span>
              {#if none}<span class="tag">no kick or snare</span>{:else if sm}<span class="tag">main groove</span>{:else}<span class="tag example">different</span>{/if}</div>
            {#if !none && !sm}<Rack rows={[{ name: "Kick", steps: s.kick }, { name: "Snare / clap", steps: s.snare }, { name: "Hi-hats", steps: s.hats }]} />{/if}
          </div>
        {/each}
      </details>
    {/if}
    <p class="why">{`Kick: ${stepsText(a.pattern.kick)}. Snare/clap: ${stepsText(a.pattern.snare)}. Hats: ${hatFeel(a.pattern.hats)}. ${a.rhythm.fourFloor ? "Kick on every beat = four-on-the-floor." : "Kick isn't on every beat, so it's a broken or half-time groove."}`}</p>
    <p class="tip">Draw it in each drum's Piano roll on the C5 row (Snap: 1/4 beat), then pull some hat velocities down in the velocity lane at the bottom. Small velocity changes make drums sound human.</p>
  </section>
  <section class="panel">
    <h2>Frequency balance</h2>
    <p class="small">Where the energy sits in the loudest parts. The dark tick is a rough reference for modern electronic music.</p>
    <div class="bars">
      {#each a.balance as v, i (i)}
        <div class="bar"><span>{BANDS[i]}</span><div class="track"><div class="fill" style:width={Math.min(100, v * 2.2) + "%"}></div><div class="ref" style:left={Math.min(100, REF[i] * 2.2) + "%"}></div></div><span class="num">{v + "%"}</span></div>
      {/each}
    </div>
    <p class="small">{`Stereo width ${a.width} (0 = mono, 0.5+ = very wide). Loud-part level ${a.loudRms} dBFS.`}</p>
  </section>
</div>
