// Hash router: the URL hash is the source of truth, so back/forward, reload and shared links all work.
import { parseHash, type RouteId } from "./routes";

export function createRouter() {
  let current = $state<RouteId>(parseHash(location.hash));
  const sync = () => { current = parseHash(location.hash); };
  window.addEventListener("hashchange", sync);
  return {
    get current() { return current; },
    navigate(id: RouteId) { if (location.hash !== "#" + id) location.hash = id; else sync(); },
    destroy() { window.removeEventListener("hashchange", sync); },
  };
}
export type Router = ReturnType<typeof createRouter>;
