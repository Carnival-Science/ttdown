#!/usr/bin/env node
// Local static server for development:  npm run dev   (PORT=xxxx to change the port; PORT=0 picks a free one)
// Serves the app at http://localhost:5173 so it runs from a real origin (hash routing, downloads and
// audio behave as they do when hosted). Only listens on this machine.
//
// Deny by default. Only the paths in ALLOW are served, so .git, node_modules, dotfiles (.env), run records
// and local copies are never exposed. Every path segment is checked so Windows aliases can't slip past:
// case changes (.GIT), 8.3 short names (GIT~1), NTFS streams (file::$DATA), trailing dots/spaces.
// The Host header must be localhost/127.0.0.1 on our port, which blocks DNS-rebinding from web pages.
// tests/dev-server.test.js checks all of this.
"use strict";
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");

const ROOT = fs.realpathSync(path.resolve(__dirname, "..")), HOST = "127.0.0.1";
const PORT = process.env.PORT != null && process.env.PORT !== "" ? Number(process.env.PORT) : 5173;
// exact-case, relative to the project folder: a file, or a folder ending in "/"
const ALLOW = ["index.html", "docs/", "test-songs/", "tests/samples/"];
const TYPES = { ".html": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".wav": "audio/wav", ".mp3": "audio/mpeg" };

const deny = (res, code, msg) => res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" }).end(msg);
// a segment Windows (or a shell) could read as something else, or a hidden file/folder
const badSegment = s => s.startsWith(".") || /[~:\\\0]/.test(s) || /[. ]$/.test(s);
const inside = (p, root) => process.platform === "win32" ? p.toLowerCase().startsWith(root.toLowerCase() + path.sep) : p.startsWith(root + path.sep);

const server = http.createServer((req, res) => {
  const port = server.address().port, host = String(req.headers.host || "").toLowerCase();
  if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) return deny(res, 403, "Forbidden host");
  if (req.method !== "GET" && req.method !== "HEAD") return deny(res, 405, "Method not allowed");
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch (e) { return deny(res, 400, "Bad request"); }
  const segs = rel.split("/").filter(Boolean);
  if (segs.length === 0) segs.push("index.html");
  if (segs.some(badSegment)) return deny(res, 403, "Forbidden");
  const relPath = segs.join("/");
  if (!ALLOW.some(a => a.endsWith("/") ? relPath.startsWith(a) : relPath === a)) return deny(res, 403, "Forbidden");
  fs.realpath(path.join(ROOT, ...segs), (err, real) => {
    if (err) return deny(res, 404, "Not found");
    if (!inside(real, ROOT)) return deny(res, 403, "Forbidden"); // symlink/junction pointing out of the project
    fs.stat(real, (err2, st) => {
      if (err2 || !st.isFile()) return deny(res, 404, "Not found");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(real).toLowerCase()] || "application/octet-stream", "Content-Length": st.size,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(real).pipe(res);
    });
  });
});
server.listen(PORT, HOST, () => console.log(`Track Teardown dev server: http://localhost:${server.address().port}/  (Ctrl+C to stop)`));
