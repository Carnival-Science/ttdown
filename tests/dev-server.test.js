// Security regression test for scripts/dev-server.js: starts it on a free port and tries to reach files
// that must never be served (git history, packages, dotfiles, run records) by every trick found in review,
// plus a foreign Host header (DNS rebinding).   node tests/dev-server.test.js
"use strict";
const { spawn } = require("node:child_process"), http = require("node:http"), path = require("node:path");

// DEV_SERVER overrides which server file to test (used to confirm the test fails on the old, vulnerable server)
const srv = spawn(process.execPath, [process.env.DEV_SERVER || path.join(__dirname, "..", "scripts", "dev-server.js")], { env: { ...process.env, PORT: "0" } });
const get = (port, p, host, method = "GET") => new Promise(r => {
  const q = http.request({ host: "127.0.0.1", port, path: p, method, headers: { Host: host || `localhost:${port}` } }, s => { s.resume(); s.on("end", () => r(s.statusCode)); });
  q.on("error", e => r("ERR " + e.code)); q.end();
});

let out = "";
const timer = setTimeout(() => { console.error("dev server did not start"); srv.kill(); process.exit(1); }, 10000);
srv.stdout.on("data", async d => {
  out += d; const m = out.match(/localhost:(\d+)\//); if (!m) return; clearTimeout(timer); srv.stdout.removeAllListeners("data");
  const port = Number(m[1]);
  // [path, expected status, why]
  const cases = [
    ["/", 200, "app"], ["/index.html", 200, "app"], ["/docs/TECHNICAL_AUDIT_2026-11-16.md", 200, "allowed folder"],
    ["/tests/samples/kick.wav", 200, "allowed folder"], ["/test-songs/stem_bass.mp3", 200, "allowed folder"],
    ["/.git/config", 403, "git"], ["/.GIT/config", 403, "git, case"], ["/.Git/HEAD", 403, "git, case"], ["/GIT~1/config", 403, "git, 8.3 name"],
    ["/.git./config", 403, "trailing dot"], ["/.git%20/config", 403, "trailing space"], ["/index.html::$DATA", 403, "NTFS stream"],
    ["/node_modules/playwright/package.json", 403, "packages"], ["/NODE_MODULES/playwright/package.json", 403, "packages, case"],
    ["/.env", 403, "dotfile"], ["/.gitignore", 403, "dotfile"], ["/.github/workflows/ci.yml", 403, "dot-folder"],
    ["/%2e%2e/%2e%2e/Windows/win.ini", 403, "traversal"], ["/..%5c..%5cWindows%5cwin.ini", 403, "traversal, backslash"], ["/C:/Windows/win.ini", 403, "drive path"],
    ["/package.json", 403, "not allowlisted"], ["/package-lock.json", 403, "not allowlisted"], ["/tests/out/", 403, "run records"],
    ["/versionA.bak.html", 403, "local copy"], ["/scripts/dev-server.js", 403, "source"], ["/INDEX.HTML", 403, "allowlist is exact-case"],
    ["/docs/missing.md", 404, "allowed but absent"],
    ["/app/package.json", 403, "svelte app: package file"], ["/app/src/main.ts", 403, "svelte app: source"], ["/app/vite.config.ts", 403, "svelte app: config"],
    ["/app/node_modules/svelte/package.json", 403, "svelte app: packages"], ["/app/dist/../src/main.ts", 403, "svelte app: traversal out of dist"],
    ["/app/dist/%2e%2e/package.json", 403, "svelte app: encoded traversal"], ["/APP/dist/production/index.html", 403, "svelte app: exact case"],
    ["/app/dist/no-such-build/index.html", 404, "svelte app: allowed but absent"],
  ];
  let fails = 0;
  for (const [p, want, why] of cases) { const got = await get(port, p); if (got !== want) { fails++; console.log(`FAIL ${p} -> ${got} (want ${want}, ${why})`); } }
  for (const [host, want] of [["attacker.example:" + port, 403], ["localhost.attacker.example:" + port, 403], ["127.0.0.1:" + port, 200], ["LOCALHOST:" + port, 200]]) {
    const got = await get(port, "/", host); if (got !== want) { fails++; console.log(`FAIL Host ${host} -> ${got} (want ${want})`); } }
  { const got = await get(port, "/", null, "POST"); if (got !== 405) { fails++; console.log(`FAIL POST / -> ${got} (want 405)`); } }
  srv.kill();
  console.log(fails ? `dev-server tests: ${fails} failed` : `dev-server tests passed (${cases.length + 5} checks)`);
  process.exitCode = fails ? 1 : 0;
});
