<!-- Volume: song, app sounds, mute (legacy #volbtn/#volpop). Applies to every sound through the audio service. -->
<script lang="ts">
  import Popover from "../lib/ui/Popover.svelte";
  import { audio } from "../lib/audio/service.svelte";
  const icon = $derived(audio.vol.muted || (audio.vol.song === 0 && audio.vol.sounds === 0) ? "🔇" : "🔊");
</script>

<div class="volwrap">
  <Popover label="Volume" title="Volume" triggerId="volbtn" triggerClass="volbtn" contentClass="tt-pop volpop" keepMounted showTitle={false}>
    {#snippet trigger()}{icon}{/snippet}
    <label>Song <input type="range" id="vol-song" min="0" max="100" aria-label="Song volume" value={Math.round(audio.vol.song * 100)} oninput={e => audio.setSong(+e.currentTarget.value / 100)}></label>
    <label>App sounds <input type="range" id="vol-sounds" min="0" max="100" aria-label="Volume of previews, beeps and games" value={Math.round(audio.vol.sounds * 100)} oninput={e => audio.setSounds(+e.currentTarget.value / 100)}></label>
    <button type="button" class="btn" id="vol-mute" onclick={() => audio.toggleMute()}>{audio.vol.muted ? "Unmute" : "Mute all"}</button>
    <small>App sounds = previews, Check by ear, beat clicks, key checks and ear training.</small>
  </Popover>
</div>
