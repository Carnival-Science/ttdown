<!-- TTdown modal dialog (the changelog). Wraps @ui-sdk/svelte/dialog: Escape and the backdrop close it, focus is trapped and returns to the
     button that opened it, and the page behind is inert while it is open. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Dialog, DialogBackdrop, DialogContent, DialogTitle, DialogClose } from "@ui-sdk/svelte/dialog";

  let { open = $bindable(false), title, subtitle, children }: { open?: boolean; title: string; subtitle?: string; children: Snippet } = $props();
</script>

<Dialog bind:open modal>
  <DialogBackdrop class="tt-dialog-backdrop" />
  <DialogContent initialFocus="content" class="tt-dialog">
    <div class="tt-dialog-head"><DialogTitle class="tt-dialog-title">{title}</DialogTitle>{#if subtitle}<span class="tt-dialog-sub">{subtitle}</span>{/if}<DialogClose class="tt-dialog-close" aria-label="Close">Close</DialogClose></div>
    <div class="tt-dialog-body">{@render children()}</div>
  </DialogContent>
</Dialog>
