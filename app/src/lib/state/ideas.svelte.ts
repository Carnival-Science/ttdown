// The idea generator's settings and current ideas live in the shared domain module (IDEAS, a plain object). Anything that
// changes them bumps this revision so the Idea generator redraws, as the legacy page re-rendered it.
export const ideasSignal = $state({ rev: 0 });
export const bumpIdeas = () => { ideasSignal.rev++; };
