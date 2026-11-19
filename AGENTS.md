# Teardown: rules for AI coding agents

This file is read automatically by **Codex** (`AGENTS.md`) and by **Claude Code** (through `CLAUDE.md`, which imports it).
Both agents follow the same rules. Humans (the founder and the CTO) decide; agents build, review and report.
`app/AGENTS.md` adds rules for the Svelte app. `docs/ROADMAP.md` is the living plan.

## Priorities
Accuracy first, explainability second, workflow third, UI polish last. An unmeasured improvement is not an improvement.

## Hard rules
1. **Never merge, deploy, or push to `main`.** Every change goes through a pull request; a human merges it.
2. **One branch per agent and task.** Claude Code uses `claude/<topic>`, Codex uses `codex/<topic>`.
   Never push to the other agent's branch. To change it, leave a review comment or open a PR that targets that branch.
3. **Never fabricate.** Every claim of "tested", "passes", "faster" or "more accurate" names the exact command and its result,
   or a CI run, commit, or file. If something was not run, write "not run". If it could not be checked, write "not verified".
4. **This repository is public.** Never commit audio, stems, DAW sessions, private annotations, contributor or rights
   information, credentials, tokens, or personal data. Real-music data lives outside GitHub (see issue #36).
5. **Analysis (DSP) changes** must be measured against the pinned Version A with the benchmark (`npm run benchmark`,
   `npm run bench:synthetic`, `npm run bench:parity`) and must report the before and after numbers, including regressions.
   Never change a gate, threshold or ground-truth file to make a result pass.
6. **Reproduce before fixing.** A bug fix includes a test or command that failed before the fix and passes after it.
7. Ask a human before changing anything outside the repo: organization settings, apps, secrets, deployments, other repositories.

## Commands (mirror `.github/workflows/ci.yml`)
```
npm ci && npm --prefix app ci
npm run songs && npm run songs:time && npm run songs:melody   # generated test audio, not committed
npm test                      # feature and unit tests
npm run benchmark             # G0 gates
npm run bench:synthetic && npm run bench:parity && npm run bench:crosscheck && npm run bench:integrity
npm run app:check && npm run app:build && npm run app:smoke && npm run app:parity && npm run app:product-tests
```
On Windows, check out with LF line endings (`git config core.autocrlf false`, `git config core.eol lf`) until PR #38 is merged.

## How Claude Code and Codex work together
The loop is **build → cross-review → respond → human decision**. GitHub is the only shared channel: issues, pull requests
and review comments. Neither agent sees the other's chat.

1. **Claim.** Before starting, comment on the issue: `Claimed by Claude Code` or `Claimed by Codex`, with the planned branch.
   Don't start work another agent has claimed. If there is no issue, open one first.
2. **Build.** Open a PR with the template below. Mark it draft until its own checks pass locally.
3. **Cross-review.** The *other* agent reviews every PR before a human merges it.
   - To ask Codex: comment `@codex review` on the PR (needs Codex code review switched on for this repository).
   - To ask Claude Code: the founder asks Claude Code in a session to review the PR by number.
   - Follow the review guidelines below. Every finding has a severity, a file and line, and a way to reproduce it.
4. **Respond.** The author answers every finding with one of: **fixed** (commit), **disputed** (with evidence),
   or **deferred** (link to a new issue). Silence is not an answer.
5. **Human decision.** The founder or CTO merges, or not. An agent's approval is advice, not permission.
6. **Log mistakes.** When a review or test catches an agent's mistake, add a line to `docs/AGENT_LOG.md`.
   Both agents read the log before starting work and avoid repeating what is in it.

### Pull request template
```
## What and why
## Evidence      (commands run and their results; CI run; before/after numbers for any analysis change)
## Not verified  (what was not run or could not be checked)
## Risks         (what could break, and who would notice)
## Built by      Claude Code | Codex      ## Reviewed by   (the other agent, once done)
```

## Review guidelines
Codex uses this section for `@codex review`; Claude Code uses it for every review.
- **Reproduce** before reporting. Report what you ran and what happened. Label a finding *unverified* if you could not run it.
- Severity: **P0** wrong results shown to users, data loss, or private data exposed; **P1** wrong measurement, a test that
  cannot fail, a claim without evidence; **P2** maintainability or clarity; **nit**.
- Check especially: measurement validity (does the metric measure what it claims?), tests that pass for the wrong reason,
  ground-truth leakage between development and holdout data, silent fallbacks, claims in docs or PR text that the evidence
  does not support, changes to gates or thresholds, and anything that would put private data in this public repository.
- Review the code, not the author. Say what is good as well as what is wrong; never approve what you have not read.
