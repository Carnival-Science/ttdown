// Benchmark targets: WHICH build of Track Teardown the harness drives, and how it is identified in every output.
//
//   legacy  the single-file page (index.html, or a frozen copy such as Version A), loaded from file:// exactly as before
//   svelte  the compiled Svelte application (app/dist/<build>/), served over http://localhost by scripts/dev-server.js
//
// The legacy path is the code that used to live inline in bench/run.js, unchanged, so legacy predictions are identical
// to what the harness produced before this module existed. The Svelte target can load the app and verify its identity,
// but it cannot analyse yet: the app does not run the extracted analysis engine until M3. It refuses instead of guessing,
// so no parity number can be produced for it before then.
"use strict";
const path = require("node:path"), fs = require("node:fs"), { spawn } = require("node:child_process");
const { sha256File } = require("./provenance");

// index.html of the frozen Version A (docs/BASELINE_A.md). A legacy page with this hash is labelled as frozen.
const VERSION_A_PAGE_SHA256 = "a14fea96191784e1c0c40c2d1da64e7b2a60b318f07d56b1faecc524836a7bab";
const KINDS = ["legacy", "svelte"];

class TargetError extends Error { constructor(code, msg) { super(msg); this.name = "TargetError"; this.code = code; } }

function legacyTarget({ root, page = "index.html" }) {
  const file = path.join(root, page);
  if (!fs.existsSync(file)) throw new TargetError("missing-page", `Legacy page not found: ${page}`);
  const pageSha256 = sha256File(file);
  return {
    kind: "legacy", canAnalyze: true,
    async start() {}, async stop() {},
    url: () => `file://${root}/${page}#teardown`,
    describe: () => ({ kind: "legacy", variant: pageSha256 === VERSION_A_PAGE_SHA256 ? "frozen-version-a" : "working", loadedFrom: "file", page, pageSha256 }),
    async verifyIdentity() { return null; },
    // Same steps, timeouts and record fields as the original inline code in run.js.
    async analyzeTrack(p, audioPath, rec) {
      await p.goto(this.url()); await p.waitForTimeout(300);
      const t0 = Date.now();
      await p.setInputFiles("#file", audioPath);
      try { await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 600000 }); }
      catch (e) { rec.status = "timeout"; }
      rec.runtimeMs = Date.now() - t0;
      if (rec.status === "ok") {
        const r = await p.evaluate(() => {
          const st = document.querySelector("#status").textContent; if (/Couldn/.test(st)) return { failed: st };
          const a = window.__td, N = window.__sn(a);
          return { full: JSON.parse(JSON.stringify(a)), grid: a.grid || null,
            exported: { stepSec: N.stepSec, kick: N.D.kick.map(n => n.t), snare: N.D.snare.map(n => n.t), hats: N.D.hats.map(n => n.t), bass: N.bass.map(n => ({ t: n.t, dur: n.dur, midi: n.midi })) } };
        });
        if (r.failed) { rec.status = "analysis-failed"; rec.message = r.failed.slice(0, 200); }
        else Object.assign(rec, r);
      }
    },
  };
}

function svelteTarget({ root, build = "bench" }) {
  if (!/^[a-z]+$/.test(build)) throw new TargetError("bad-build", `Bad build name: ${build}`);
  const dist = path.join(root, "app", "dist", build), manifestFile = path.join(dist, "build-manifest.json");
  if (!fs.existsSync(manifestFile)) throw new TargetError("missing-build", `No Svelte build at app/dist/${build}/ (run: npm --prefix app run build${build === "bench" ? ":bench" : ""})`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  let server = null, base = null;
  return {
    kind: "svelte", canAnalyze: false, manifest,
    async start() {
      if (server) return;
      server = spawn(process.execPath, [path.join(root, "scripts", "dev-server.js")], { env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "inherit"] });
      base = await new Promise((resolve, reject) => {
        let out = ""; const timer = setTimeout(() => reject(new TargetError("server", "dev server did not start")), 10000);
        server.on("exit", c => { clearTimeout(timer); reject(new TargetError("server", `dev server exited (${c})`)); });
        server.stdout.on("data", d => { out += d; const m = out.match(/http:\/\/localhost:(\d+)\//); if (m) { clearTimeout(timer); resolve(`http://localhost:${m[1]}/`); } });
      });
    },
    async stop() { if (server) { server.kill(); server = null; base = null; } },
    url() { if (!base) throw new TargetError("not-started", "start() the target first"); return `${base}app/dist/${build}/index.html#teardown`; },
    describe: () => ({ kind: "svelte", variant: build, loadedFrom: "http://localhost", entry: `app/dist/${build}/index.html`,
      bundleSha256: manifest.bundleSha256, buildGitSha: manifest.gitSha, buildGitDirty: manifest.gitDirty, timemapSha256: manifest.timemapSha256 }),
    // The page's own window.__build must match the externally computed manifest (same commit, same TimeMap source).
    async verifyIdentity(p) {
      const id = await p.evaluate(() => window.__build || null);
      if (!id) throw new TargetError("no-identity", "The page has no window.__build");
      const bad = [["gitSha", id.gitSha, manifest.gitSha], ["timemapSha256", id.timemapSha256, manifest.timemapSha256], ["mode", id.mode, manifest.mode]].filter(([, a, b]) => a !== b);
      if (bad.length) throw new TargetError("identity-mismatch", "Page identity does not match build-manifest.json: " + bad.map(([k, a, b]) => `${k} ${a} != ${b}`).join(", "));
      return id;
    },
    async analyzeTrack() { throw new TargetError("cannot-analyze", "The Svelte app does not run the analysis engine yet (migration M3). No predictions are produced for it."); },
  };
}

function createTarget({ kind = "legacy", root, page, build }) {
  if (!KINDS.includes(kind)) throw new TargetError("bad-kind", `Unknown target "${kind}" (use ${KINDS.join(" or ")})`);
  return kind === "legacy" ? legacyTarget({ root, page }) : svelteTarget({ root, build });
}

module.exports = { createTarget, TargetError, KINDS, VERSION_A_PAGE_SHA256 };
