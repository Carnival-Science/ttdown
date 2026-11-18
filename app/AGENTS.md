# Teardown app (Svelte 5 + Vite + TypeScript)

## ui-sdk

Before using ui-sdk, follow the ui-sdk skill if it's installed, and read `node_modules/@ui-sdk/svelte/docs/llms.txt`.
To build a new component, also search `node_modules/@ui-sdk/svelte/docs/core.md` by heading, and read `rendering.md` next to it.

Project rules for ui-sdk:

- The default styles are imported once, at the entry (`src/main.ts`): `import "@ui-sdk/core/web.css"`. The app doesn't use Tailwind.
- `@ui-sdk/svelte` and `@ui-sdk/core` are pinned to exact versions (the library is in beta). Don't run a bare `npm install @ui-sdk/svelte`: it rewrites the pin to a `^` range. Upgrade deliberately, and check every prop you use against the installed `.d.ts`.
- ui-sdk is an implementation detail: only `src/lib/ui/` may import `@ui-sdk/*` (`npm run check` enforces this, apart from the stylesheet import above). Build TTdown's own components there and use those everywhere else.
