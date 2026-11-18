<!-- TTdown slider. Wraps @ui-sdk/svelte/slider: the thumb's hidden range input takes focus, keys and screen-reader gestures. -->
<script lang="ts">
  import { Slider, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from "@ui-sdk/svelte/slider";

  let { value, min = 0, max = 100, step = 1, largeStep, label, valueText, disabled = false, class: cls = "", onchange, oncommit }: {
    value: number; min?: number; max?: number; step?: number; largeStep?: number; label: string; valueText?: (v: number) => string;
    disabled?: boolean; class?: string; onchange?: (v: number) => void; oncommit?: (v: number) => void;
  } = $props();
</script>

<Slider class={"tt-slider " + cls} {value} {min} {max} {step} {largeStep} {disabled} format={valueText}
  onValueChange={v => onchange?.(v as number)} onValueCommit={v => oncommit?.(v as number)}>
  <SliderControl class="tt-slider-control">
    <SliderTrack class="tt-slider-track">
      <SliderIndicator class="tt-slider-fill" />
      <SliderThumb class="tt-slider-thumb" aria-label={label} />
    </SliderTrack>
  </SliderControl>
</Slider>
