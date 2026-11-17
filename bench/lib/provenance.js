// Where a run came from: commit, the PR head (CI tests a temporary merge commit on pull requests), dirty state.
"use strict";
const fs = require("node:fs"), crypto = require("node:crypto"), { execSync } = require("node:child_process");

const git = (cwd, args) => { try { return execSync("git " + args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch (e) { return null; } };
const sha256File = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

function provenance(root) {
  let prHeadSha = null;
  try { // GitHub Actions: on pull_request the checkout is refs/pull/N/merge; the PR head is in the event payload
    const ev = process.env.GITHUB_EVENT_PATH && JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    prHeadSha = (ev && ev.pull_request && ev.pull_request.head && ev.pull_request.head.sha) || null;
  } catch (e) {}
  const gitCommit = git(root, "rev-parse HEAD");
  return { gitCommit, headSha: prHeadSha || gitCommit, testedMergeCommit: prHeadSha ? gitCommit : null, gitDirty: !!git(root, "status --porcelain") };
}

module.exports = { provenance, sha256File, git };
