// The last comparison of "my version" against the reference (legacy lastCompare). Not persisted, as in the legacy page;
// the journal keeps each export's scores.
/* eslint-disable @typescript-eslint/no-explicit-any */
class CompareState { last = $state.raw<any>(null); pendingScore = $state<number | null>(null); }
export const compareState = new CompareState();
