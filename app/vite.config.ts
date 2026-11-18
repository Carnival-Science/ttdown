// Track Teardown, Svelte 5 application. A conventional multi-file Vite build (founder decision, M1):
//   npm run build        -> dist/production   (no test hooks)
//   npm run build:bench  -> dist/bench        (test hooks for the benchmark harness and browser tests)
// Build identity is embedded as source facts only (git commit, versions, the TimeMap source hash). Hashes of the
// compiled files are computed afterwards, outside the bundle, by scripts/build-manifest.mjs.
import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APP = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(APP, "..");
// The one canonical TimeMap. Never copied into app/; the legacy page inlines the same file (npm run sync:timemap).
const TIMEMAP = path.join(REPO, "src", "timemap.js");

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const git = (cmd: string) => { try { return execSync(`git ${cmd}`, { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
const pkgVersion = (name: string) => JSON.parse(readFileSync(path.join(APP, "node_modules", name, "package.json"), "utf8")).version as string;

/* src/timemap.js is a classic UMD script (module.exports in Node, a global in the legacy page). Give Vite an ES module
   view of the same bytes: a local `module` object for the UMD branch, then a default export. Works identically in the
   dev server and the production build, and never creates a window.TimeMap global. */
function canonicalTimeMap(): Plugin {
  return {
    name: "ttdown-canonical-timemap",
    enforce: "pre",
    transform(code, id) {
      if (path.resolve(id.split("?")[0]) !== TIMEMAP) return null;
      return { code: `const module = { exports: {} };\n${code}\nexport default module.exports;\n`, map: null };
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode !== "production" && mode !== "bench" && mode !== "development") throw new Error(`Unknown mode "${mode}"`);
  const build = {
    schema: "ttdown-build/1",
    app: "ttdown",
    appVersion: JSON.parse(readFileSync(path.join(APP, "package.json"), "utf8")).version,
    mode,
    testHooks: mode === "bench",
    gitSha: git("rev-parse HEAD"),
    gitDirty: (git("status --porcelain --untracked-files=no") ?? "") !== "",
    timemapSha256: sha256(TIMEMAP),
    versions: { svelte: pkgVersion("svelte"), vite: pkgVersion("vite"), uiSdk: pkgVersion("@ui-sdk/svelte") },
  };
  return {
    base: "./",
    plugins: [canonicalTimeMap(), svelte()],
    resolve: { alias: { $timemap: TIMEMAP } },
    define: {
      __BUILD_INFO__: JSON.stringify(build),
      __TEST_HOOKS__: JSON.stringify(mode === "bench"),
    },
    build: { outDir: `dist/${mode}`, emptyOutDir: true, sourcemap: false, target: "es2022" },
    server: { host: "127.0.0.1", port: 5174, strictPort: true, fs: { strict: true, allow: [APP, TIMEMAP] } },
    preview: { host: "127.0.0.1", port: 4174, strictPort: true },
  };
});
