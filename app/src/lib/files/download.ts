// Save a file for the user: a normal browser download (object URL revoked after 4 s, as in the legacy page).
export async function saveFile(filename: string, data: Uint8Array | string, mime: string): Promise<void> {
  const blob = new Blob([data as BlobPart], { type: mime }), url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const safeName = (title: string | undefined, fallback: string, max = 40) => (title || fallback).replace(/[^\w\- ]+/g, "").trim().slice(0, max) || fallback;
