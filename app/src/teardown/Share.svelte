<!-- Compare tab: share with your mentor (legacy sharePanel). Nothing is sent for the user. -->
<script lang="ts">
  import { teardown } from "../lib/state/teardown.svelte";
  import { compareState } from "../lib/state/compare.svelte";
  import { domain } from "../lib/domain";
  import { planDone, getLog } from "../lib/storage/data";
  import { saveFile } from "../lib/files/download";
  const { shareData, reviewHtml } = domain;
  const a = $derived(teardown.result);
  let q = $state(""), note = $state(""), fallback = $state("");
  const data = () => shareData(a, q, { planDone: planDone(a), log: getLog(), lastCompare: compareState.last });
  function copy() { const d = data(); navigator.clipboard.writeText(d.text).then(() => { note = "Copied. Paste it into your chat with Saman."; }, () => { note = "Copy was blocked. Select the text below."; fallback = d.text; }); }
  async function review() {
    const html = reviewHtml(a, q), filename = (a.title || "beat").replace(/[^\w\- ]+/g, "").trim().slice(0, 50) + " - review for Saman.html";
    try { await saveFile(filename, html, "text/html"); note = "Saved. Send Saman this file with your MP3. He opens it, types notes per section and presses Copy my notes; paste his reply into your Journal."; }
    catch (e) { note = (e as { code?: string })?.code === "declined" ? "Save cancelled." : "Saving isn't available in this view."; }
  }
  async function page() {
    const d = data(), filename = (a.title || "teardown").replace(/[^\w\- ]+/g, "").trim().slice(0, 50) + " - share page.html";
    try { await saveFile(filename, d.html, "text/html"); note = "Saved. Attach the file when you message Saman, or open it and print to PDF."; }
    catch (e) { note = (e as { code?: string })?.code === "declined" ? "Save cancelled." : "Saving isn't available in this view. Use Copy as a message."; }
  }
</script>

<section class="panel" data-group="compare">
  <h2>Share with your mentor</h2>
  <p class="small">Makes a one-page summary of this teardown, your comparison score and your progress, with one question on top of mind. Compare your version first so the score is included. Nothing is sent for you: copy the message or save the page, then send it yourself.</p>
  <textarea placeholder="What do you want feedback on? e.g. “Does my 808 sit right under the kick?”" aria-label="Your question for your mentor" style="min-height:60px" bind:value={q}></textarea>
  <div class="row">
    <button class="btn primary" type="button" onclick={copy}>Copy as a message</button>
    <button class="btn cool" type="button" onclick={review}>Make a review page for Saman</button>
    <button class="btn" type="button" onclick={page}>Save as a page (.html)</button>
    <span class="small" role="status">{note}</span>
  </div>
  {#if fallback}<textarea readonly style="height:160px">{fallback}</textarea>{/if}
</section>
