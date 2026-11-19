<!-- TTdown bottom sheet for narrow screens. Wraps @ui-sdk/svelte/drawer: swipe, Escape, focus trap and an inert page while open.
     keepMounted keeps what is inside alive while it is closed, so closing the sheet never resets it. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Drawer, DrawerBackdrop, DrawerContent, DrawerTitle, DrawerClose } from "@ui-sdk/svelte/drawer";

  let { open = $bindable(false), title, children }: { open?: boolean; title: string; children: Snippet } = $props();
</script>

<Drawer bind:open modal>
  <DrawerBackdrop class="tt-sheet-backdrop" />
  <DrawerContent keepMounted initialFocus="content" class="tt-sheet">
    <div class="tt-sheet-grip" aria-hidden="true"></div>
    <div class="tt-sheet-head"><DrawerTitle class="tt-sheet-title">{title}</DrawerTitle><DrawerClose class="tt-sheet-close">Done</DrawerClose></div>
    <div class="tt-sheet-body">{@render children()}</div>
  </DrawerContent>
</Drawer>
