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
// The framework-free modules shared with the legacy page. Never copied into app/; the legacy page inlines the same files
// (npm run sync:timemap). Each is a classic UMD script.
const SHARED = {
  timemap: path.join(REPO, "src", "timemap.js"),        // musical time model
  timingStore: path.join(REPO, "src", "timing-store.js"), // saved-teardown timing contract (docs/PERSISTENCE.md)
  engine: path.join(REPO, "src", "engine.js"),           // the analysis engine (exports a factory: createEngine({ TimeMap }))
  domain: path.join(REPO, "src", "domain.js"),           // plans, ideas, notes, exports, compare, curriculum (factory: createDomain)
};
const SHARED_FILES = new Set(Object.values(SHARED));

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const git = (cmd: string) => { try { return execSync(`git ${cmd}`, { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
const pkgVersion = (name: string) => JSON.parse(readFileSync(path.join(APP, "node_modules", name, "package.json"), "utf8")).version as string;

/* The shared modules are classic UMD scripts (module.exports in Node, globals in the legacy page). Give Vite an ES module
   view of the same bytes: a local `module` object for the UMD branch, then a default export. Works identically in the
   dev server and the production build, and never creates a global (no window.TimeMap, TimingStore or TTEngine). */
function canonicalSharedModules(): Plugin {
  return {
    name: "ttdown-canonical-shared-modules",
    enforce: "pre",
    transform(code, id) {
      if (!SHARED_FILES.has(path.resolve(id.split("?")[0]))) return null;
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
    timemapSha256: sha256(SHARED.timemap),
    timingStoreSha256: sha256(SHARED.timingStore),
    engineSha256: sha256(SHARED.engine),
    domainSha256: sha256(SHARED.domain),
    versions: { svelte: pkgVersion("svelte"), vite: pkgVersion("vite"), uiSdk: pkgVersion("@ui-sdk/svelte") },
  };
  return {
    base: "./",
    plugins: [canonicalSharedModules(), svelte()],
    resolve: { alias: { $timemap: SHARED.timemap, $timingstore: SHARED.timingStore, $engine: SHARED.engine, $domain: SHARED.domain } },
    define: {
      __BUILD_INFO__: JSON.stringify(build),
      __TEST_HOOKS__: JSON.stringify(mode === "bench"),
    },
    build: { outDir: `dist/${mode}`, emptyOutDir: true, sourcemap: false, target: "es2022" },
    server: { host: "127.0.0.1", port: 5174, strictPort: true, fs: { strict: true, allow: [APP, ...SHARED_FILES] } },
    preview: { host: "127.0.0.1", port: 4174, strictPort: true },
  };
});
