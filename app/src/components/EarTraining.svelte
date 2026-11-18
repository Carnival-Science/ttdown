<!-- Ear training: where's the kick, major or minor, which chord is next (legacy earPanel). Scores under ear_training_v1. -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { KEYS, lsGet, lsSet } from "../lib/storage/local";
  import { domain } from "../lib/domain";
  import { playRhythm, playQuality, playNext } from "../lib/audio/ear";
  const { posOf, rnd, chance } = domain as any;
  const st = $state(lsGet(KEYS.ear, { right: 0, total: 0, streak: 0, best: 0 }));
  let fb = $state(""), game = $state<any>(null);
  function answer(ok: boolean, right: string) { st.total++; if (ok) { st.right++; st.streak++; st.best = Math.max(st.best, st.streak); fb = "Right! Next one…"; } else { st.streak = 0; fb = `Not quite. It was ${right}. Listen again, then go on.`; } lsSet(KEYS.ear, { ...st }); }
  const games = {
    rhythm: () => { const opts = [0, 2, 4, 6, 8, 10, 12, 14], ans = opts[rnd(opts.length)]!, choices = [ans].concat(opts.filter(x => x !== ans).sort(() => Math.random() - 0.5).slice(0, 3)).sort((p, q) => p - q);
      game = { kind: "rhythm", ans, choices, play: () => playRhythm(ans) }; game.play(); },
    quality: () => { const r = 52 + rnd(12), minor = chance(0.5), ch = [r, r + (minor ? 3 : 4), r + 7]; game = { kind: "quality", minor, play: () => playQuality(ch) }; game.play(); },
    next: () => { const root = 48 + rnd(7), ans = [3, 4, 5][rnd(3)]!; game = { kind: "next", ans, play: () => playNext(root, ans) }; game.play(); },
  };
  const names: Record<number, string> = { 3: "IV (4)", 4: "V (5)", 5: "vi (6, minor)" };
  const after = (k: keyof typeof games) => setTimeout(games[k], 1400);
</script>

<section class="panel" id="ear">
  <div class="row" style="justify-content:space-between"><h2>Ear training (5 minutes a day)</h2><b>{`${st.right} / ${st.total} right · streak ${st.streak} · best ${st.best}`}</b></div>
  <p class="small">Train the skills the Teardown does for you, so you can hear them yourself.</p>
  <div class="row">
    <button class="btn primary" type="button" onclick={games.rhythm}>Where's the kick?</button>
    <button class="btn primary" type="button" onclick={games.quality}>Major or minor?</button>
    <button class="btn primary" type="button" onclick={games.next}>Which chord is next?</button>
  </div>
  <div style="display:grid;gap:10px">
    {#if game?.kind === "rhythm"}
      <p>A kick plays on beat 1.1 and on one more spot. Where is the second kick? (hats help you count: loud hats are on the beats)</p>
      <div class="row"><button class="btn cool" type="button" onclick={game.play}>▶ Play again</button>{#each game.choices as x (x)}<button class="btn" type="button" onclick={() => { answer(x === game.ans, posOf(game.ans)); after("rhythm"); }}>{posOf(x)}</button>{/each}</div>
      <p class="small" role="status">{fb}</p>
    {:else if game?.kind === "quality"}
      <p>Is this chord major (bright) or minor (darker)?</p>
      <div class="row"><button class="btn cool" type="button" onclick={game.play}>▶ Play again</button>
        <button class="btn" type="button" onclick={() => { answer(!game.minor, game.minor ? "minor" : "major"); after("quality"); }}>Major</button>
        <button class="btn" type="button" onclick={() => { answer(game.minor, game.minor ? "minor" : "major"); after("quality"); }}>Minor</button></div>
      <p class="small" role="status">{fb}</p>
    {:else if game?.kind === "next"}
      <p>The first chord is home (I). Which chord comes after it?</p>
      <div class="row"><button class="btn cool" type="button" onclick={game.play}>▶ Play again</button>{#each [3, 4, 5] as d (d)}<button class="btn" type="button" onclick={() => { answer(d === game.ans, names[game.ans]!); after("next"); }}>{names[d]}</button>{/each}</div>
      <p class="small" role="status">{fb}</p>
      <p class="why">Hint: IV feels like lifting, V feels like it wants to go back home, vi sounds sad.</p>
    {/if}
  </div>
</section>
