// Section colours for the song map. Validated on the inset surface (dataviz validate_palette, all pairs, dark):
// Groove, Drop and Breakdown are three clean categorical hues; Build is a light step of Drop's hue (it leads into it), and
// Intro/Outro are a quiet neutral (the edges, not the body). Every band also carries its name, so colour is never alone.
export const SECTION_COLORS: Record<string, string> = {
  Intro: "#5a5f6e", Outro: "#5a5f6e", Build: "#f2b48f", Drop: "#d95926", Groove: "#3987e5", Breakdown: "#199e70",
};
export const sectionColor = (label: string) => SECTION_COLORS[label] ?? "#5a5f6e";

/** The name shown for a section. The analyzer's "Groove" is its catch-all for a stretch with no clear change, which says nothing about drums,
 *  so it is shown as what it is: the main part, or the whole track when nothing changed. Other labels are shown as given (they are rules,
 *  not facts: the Arrangement heading says so). The data keeps the analyzer's label. */
export const sectionName = (label: string, a: { steady?: boolean; sections?: unknown[] }): string =>
  label !== "Groove" ? label : a.steady ? ((a.sections?.length ?? 0) <= 1 ? "Whole track" : "Steady part") : "Main part";
