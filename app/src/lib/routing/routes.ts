// Top-level views. Hash names are the legacy page's, so existing links keep working; the default is Teardown
// (founder decision, M1), not Learn as in the legacy page. Any unknown hash also lands on Teardown.
export const ROUTES = [
  { id: "teardown", label: "Teardown", title: "Take a song apart" },
  { id: "learn", label: "Learn", title: "Learn FL Studio" },
  { id: "samples", label: "Sample Lab", title: "Sort and tag your samples" },
  { id: "journal", label: "Journal", title: "Practice journal" },
] as const;
export type RouteId = (typeof ROUTES)[number]["id"];
export const DEFAULT_ROUTE: RouteId = "teardown";
const IDS = new Set<string>(ROUTES.map(r => r.id));

export function parseHash(hash: string): RouteId {
  const key = hash.replace(/^#\/?/, "").split(/[/?]/)[0] ?? "";
  return IDS.has(key) ? (key as RouteId) : DEFAULT_ROUTE;
}
