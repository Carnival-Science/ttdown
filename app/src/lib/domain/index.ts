// The app's only entry to the domain logic: the canonical src/domain.js (plans, ideas, notes, exports, compare,
// curriculum data), created with the canonical engine and TimingStore. No copy lives in app/.
import createDomain from "$domain";
import { engine } from "../engine";
import { TimingStore } from "../persistence/timing";
export type { Domain } from "./domain-module";
export const domain = createDomain({ TimingStore, engine });
