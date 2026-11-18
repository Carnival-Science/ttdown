// Save a file for the user: through the Claude runtime's downloads capability when present, otherwise a normal browser
// download. Same behaviour as the legacy page (object URL revoked after 4 s).
import { useCap } from "../runtime/claude";
export async function saveFile(filename: string, data: Uint8Array | string, mime: string): Promise<void> {
  const dl = await useCap("downloads");
  if (dl) { await dl.save({ filename, data }); return; }
  const blob = new Blob([data as BlobPart], { type: mime }), url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** The legacy saveOne/saveZip message convention: returns the note to show. */
export async function saveWithNote(filename: string, data: Uint8Array | string, mime: string, okMsg: string): Promise<string> {
  try { await saveFile(filename, data, mime); return okMsg; }
  catch (e) { return (e as { code?: string })?.code === "declined" ? "Download cancelled." : "Downloads aren't available in this view."; }
}
export const safeName = (title: string | undefined, fallback: string, max = 40) => (title || fallback).replace(/[^\w\- ]+/g, "").trim().slice(0, max) || fallback;
