<!-- TTdown toggle button (stays pressed). Wraps @ui-sdk/svelte/toggle; the label stays the same in both states. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Toggle } from "@ui-sdk/svelte/toggle";

  let { pressed, disabled = false, title, class: cls = "", children, onchange, ...rest }: {
    pressed: boolean; disabled?: boolean; title?: string; class?: string; children: Snippet; onchange: (p: boolean) => void; [k: string]: unknown;
  } = $props();
</script>

<Toggle class={"tt-toggle " + cls} {pressed} {disabled} {title} {...rest} onPressedChange={p => onchange(p)}>{@render children()}</Toggle>
