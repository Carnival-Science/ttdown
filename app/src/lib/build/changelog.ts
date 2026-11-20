// The changelog the app shows: CHANGELOG.md at the repository root, read at build time (one source, no copy to keep in step).
// Format (checked by tests/changelog.test.js): `## vX.Y.Z (YYYY-MM-DD)`, an optional intro paragraph, then `### Features`, `### Improvements`
// or `### Fixes`, each a list of `- text` items. Anything else in the file is ignored here.
import raw from "../../../../CHANGELOG.md?raw";

export interface Release { version: string; date: string; intro: string; sections: { title: string; items: string[] }[] }

export function parseChangelog(text: string): Release[] {
  const out: Release[] = []; let rel: Release | null = null, sec: { title: string; items: string[] } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const h2 = line.match(/^## v(\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)\s*$/), h3 = line.match(/^### (.+?)\s*$/), li = line.match(/^- (.+)$/);
    if (h2) { rel = { version: h2[1]!, date: h2[2]!, intro: "", sections: [] }; sec = null; out.push(rel); }
    else if (rel && h3) { sec = { title: h3[1]!, items: [] }; rel.sections.push(sec); }
    else if (rel && sec && li) sec.items.push(li[1]!);
    else if (rel && !sec && line.trim() && !line.startsWith("#")) rel.intro = (rel.intro ? rel.intro + " " : "") + line.trim();
  }
  return out;
}
export const RELEASES: readonly Release[] = parseChangelog(raw);
