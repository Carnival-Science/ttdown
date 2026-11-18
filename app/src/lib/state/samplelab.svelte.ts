// Samples analysed in Sample Lab during this visit (legacy labItems / labKey). Not persisted; the shelf is.
/* eslint-disable @typescript-eslint/no-explicit-any */
class SampleLab { items = $state.raw<any[]>([]); key = $state<string | null>(null); filter = $state("All"); }
export const lab = new SampleLab();
