// What this build is. Source facts only (commit, versions, TimeMap source hash), fixed at build time by vite.config.ts.
// The hashes of the compiled files are NOT here: a bundle cannot contain its own hash. They are computed after the
// build by scripts/build-manifest.mjs into dist/<mode>/build-manifest.json, and checked against `gitSha` by the harness.
export interface BuildInfo {
  schema: "ttdown-build/1";
  app: "ttdown";
  appVersion: string;
  mode: "production" | "bench" | "development";
  testHooks: boolean;
  gitSha: string | null;
  gitDirty: boolean;
  timemapSha256: string;
  versions: { svelte: string; vite: string; uiSdk: string };
}
declare const __BUILD_INFO__: BuildInfo;
export const BUILD: Readonly<BuildInfo> = Object.freeze({ ...__BUILD_INFO__, versions: Object.freeze({ ...__BUILD_INFO__.versions }) });

/** `window.__build`: read-only, in every build (it holds no user data). */
export function installBuildIdentity(): void {
  Object.defineProperty(window, "__build", { value: BUILD, enumerable: false, configurable: false, writable: false });
}
