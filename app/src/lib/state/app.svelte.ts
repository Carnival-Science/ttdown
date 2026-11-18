// App-wide view state other parts read (legacy curView(), lastTeardown, openMission).
/* eslint-disable @typescript-eslint/no-explicit-any */
class AppState { route = $state("teardown"); lastTeardown = $state.raw<any>(null); openMission = $state<string | null>(null); }
export const app = new AppState();
