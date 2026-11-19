// Unit tests for the app's own TypeScript modules (npm run test:unit in app/, npm run app:unit at the repo root).
// Reuses vite.config.ts, so tests import the same canonical shared modules ($timemap, $timingstore, $engine) through the same
// plugin and aliases as the dev server and the builds. vite.config.ts only accepts its three modes, so the tests run in "development".
// Browser behaviour (rendering, audio, downloads) is covered by the Playwright suites in tests/ at the repo root, not here.
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default defineConfig(env =>
  mergeConfig(viteConfig({ ...env, mode: "development" }), {
    test: {
      include: ["tests/unit/**/*.test.ts"],
      environment: "node",
      unstubGlobals: true,
      restoreMocks: true,
    },
  }),
);
