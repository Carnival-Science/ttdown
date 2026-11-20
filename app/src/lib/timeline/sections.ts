// Section colours for the song map, on paper: quiet, earthy categorical hues that stay below cobalt (which is reserved for selection and
// playback). Drop is the brand lime, Build a light step of it (it leads into it), Groove ochre, Breakdown a grey teal, and Intro/Outro a
// neutral silver (the edges, not the body). Every band also carries its name, so colour is never alone.
export const SECTION_COLORS: Record<string, string> = {
  Intro: "#A9B1A8", Outro: "#A9B1A8", Build: "#B9D88F", Drop: "#6E9F3F", Groove: "#C9A64B", Breakdown: "#5E9A92",
};
export const sectionColor = (label: string) => SECTION_COLORS[label] ?? "#A9B1A8";

/** The name shown for a section. The analyzer's "Groove" is its catch-all for a stretch with no clear change, which says nothing about drums,
 *  so it is shown as what it is: the main part, or the whole track when nothing changed. Other labels are shown as given (they are rules,
 *  not facts: the Arrangement heading says so). The data keeps the analyzer's label. */
export const sectionName = (label: string, a: { steady?: boolean; sections?: unknown[] }): string =>
  label !== "Groove" ? label : a.steady ? ((a.sections?.length ?? 0) <= 1 ? "Whole track" : "Steady part") : "Main part";
