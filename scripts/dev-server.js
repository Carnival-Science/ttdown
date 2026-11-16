#!/usr/bin/env node
// Local static server for development:  npm run dev   (PORT=xxxx to change the port)
// Serves this folder at http://localhost:5173 so the app runs from a real origin (hash routing,
// downloads and audio all behave as they do when hosted). Only listens on this machine.
"use strict";
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, ".."), PORT = Number(process.env.PORT) || 5173, HOST = "127.0.0.1";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".wav": "audio/wav", ".mp3": "audio/mpeg" };

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (e) { res.writeHead(400).end("Bad request"); return; }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(ROOT, "." + rel);
  // stay inside the project folder, and never serve git internals or installed packages
  if (!file.startsWith(ROOT + path.sep) || /[\\/](\.git|node_modules)([\\/]|$)/.test(file.slice(ROOT.length))) { res.writeHead(403).end("Forbidden"); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, HOST, () => console.log(`Track Teardown dev server: http://localhost:${PORT}/  (Ctrl+C to stop)`));
