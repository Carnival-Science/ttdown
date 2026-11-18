// bench/lib/target.js: which build the harness measures and how it is identified. Pure checks, no browser.
//   node tests/bench-target.test.js
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createTarget, TargetError, VERSION_A_PAGE_SHA256 } = require("../bench/lib/target");

const ROOT = path.resolve(__dirname, "..");
let n = 0; const ok = (name, fn) => { fn(); n++; };

ok("legacy is the default target and keeps the file:// URL the harness always used", () => {
  const t = createTarget({ root: ROOT });
  assert.equal(t.kind, "legacy"); assert.equal(t.canAnalyze, true);
  assert.equal(t.url(), `file://${ROOT}/index.html#teardown`);
  const d = t.describe(); assert.equal(d.loadedFrom, "file"); assert.equal(d.page, "index.html"); assert.match(d.pageSha256, /^[0-9a-f]{64}$/);
  assert.equal(d.variant, d.pageSha256 === VERSION_A_PAGE_SHA256 ? "frozen-version-a" : "working");
});
ok("a legacy page with Version A's hash is labelled frozen", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-target-")); fs.writeFileSync(path.join(tmp, "p.html"), "x");
  assert.equal(createTarget({ root: tmp, page: "p.html" }).describe().variant, "working");
  assert.equal(VERSION_A_PAGE_SHA256, "a14fea96191784e1c0c40c2d1da64e7b2a60b318f07d56b1faecc524836a7bab"); // docs/BASELINE_A.md
});
ok("unknown kinds, missing pages and missing builds are refused", () => {
  assert.throws(() => createTarget({ kind: "react", root: ROOT }), e => e instanceof TargetError && e.code === "bad-kind");
  assert.throws(() => createTarget({ root: ROOT, page: "nope.html" }), e => e.code === "missing-page");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-target-"));
  assert.throws(() => createTarget({ kind: "svelte", root: tmp }), e => e.code === "missing-build");
  assert.throws(() => createTarget({ kind: "svelte", root: tmp, build: "../x" }), e => e.code === "bad-build");
});
ok("the svelte target is identified by its external manifest and refuses to analyse", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-target-")), dist = path.join(tmp, "app", "dist", "bench");
  fs.mkdirSync(dist, { recursive: true });
  const man = { mode: "bench", gitSha: "a".repeat(40), gitDirty: false, timemapSha256: "b".repeat(64), bundleSha256: "c".repeat(64) };
  fs.writeFileSync(path.join(dist, "build-manifest.json"), JSON.stringify(man));
  const t = createTarget({ kind: "svelte", root: tmp });
  assert.equal(t.canAnalyze, false);
  assert.deepEqual(t.describe(), { kind: "svelte", variant: "bench", loadedFrom: "http://localhost", entry: "app/dist/bench/index.html",
    bundleSha256: man.bundleSha256, buildGitSha: man.gitSha, buildGitDirty: false, timemapSha256: man.timemapSha256 });
  assert.throws(() => t.url(), e => e.code === "not-started");
  return Promise.all([
    assert.rejects(t.analyzeTrack(), e => e.code === "cannot-analyze"),
    assert.rejects(t.verifyIdentity({ evaluate: async () => ({ gitSha: man.gitSha, timemapSha256: "d".repeat(64), mode: "bench" }) }), e => e.code === "identity-mismatch"),
    assert.rejects(t.verifyIdentity({ evaluate: async () => null }), e => e.code === "no-identity"),
    t.verifyIdentity({ evaluate: async () => ({ gitSha: man.gitSha, timemapSha256: man.timemapSha256, mode: "bench" }) }),
  ]).then(() => console.log(`bench target tests passed (${n})`));
});
