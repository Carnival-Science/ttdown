# Teardown: rules for AI coding agents

This file is read automatically by **Codex** (`AGENTS.md`) and by **Claude Code** (through `CLAUDE.md`, which imports it).
`app/AGENTS.md` adds rules for the Svelte app. `docs/ROADMAP.md` is the living plan. `docs/AGENT_LOG.md` lists past agent
mistakes: read it before starting work.

GitHub (issues, pull requests, review comments) is the shared record. No agent can see another agent's chat, so anything
another agent or a human needs must be written on GitHub.

## Roles
- **CEO:** business and product decisions, priorities.
- **CTO** (`samanshaiza004`): technical architecture, engineering signoff, security.
- **Claude Code:** primary implementation.
- **Codex:** independent reviewer by default. Implements only when a human assigns it a task.
- Other AI advisors have no repository access. Their advice counts only once a human posts it on GitHub.

Humans decide; agents build, review and report. An agent's approval is advice, not permission.

## Priorities
Accuracy first, explainability second, workflow third, UI polish last. An unmeasured improvement is not an improvement.

## Hard rules
1. **Changes reach `main` through pull requests.** Agents never merge, deploy, or push to `main`. Humans also use PRs.
   Emergency exception (humans only): a direct push to `main` to stop a broken production deploy or a private-data exposure,
   followed within one working day by an issue or PR that records what was pushed and why. Branch protection is configured
   by the CTO and CEO, never by an agent.
2. **One branch per agent and task.** Claude Code uses `claude/<topic>`, Codex uses `codex/<topic>`. Never push to another
   agent's or a contributor's branch, never force-push or rewrite shared history, and never change unrelated work by others.
   To change someone else's branch, leave a review comment or open a PR that targets it.
3. **Never fabricate.** Every claim of "tested", "passes", "faster" or "more accurate" names the exact command and its result,
   or a CI run, commit, or file. If something was not run, write "not run". If it could not be checked, write "not verified".
4. **This repository is public.** Confidential recordings, stems, DAW sessions, private annotations, rights documents,
   contributor information, credentials, tokens and personal data never enter it, in any commit, issue, PR or log.
   Real-music data lives outside GitHub (see issue #36). Synthetic and redistribution-cleared test fixtures may be
   committed once a human approves them, with their generator or licence recorded next to them.
5. **Analysis (DSP) changes** are measured against the pinned Version A with the benchmark (`npm run benchmark`,
   `npm run bench:synthetic`, `npm run bench:parity`), reporting before and after numbers, including regressions.
   Never change a benchmark, gate, threshold or ground-truth file to make a result pass.
6. **Reproduce before fixing.** A bug fix includes a test or command that failed before the fix and passes after it.
7. **Ask a human first** before any GitHub action (claim comment, issue, push, PR, review request) at the gates below, and
   before changing anything outside the repo: organization settings, apps, permissions, secrets, deployments, other repos.

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

## Workflow: gates
Each gate ends with a report (format below) and a stop. Continue only after a human approves that gate.
For a low-risk task an agent may recommend combining gates, but never skips one silently.

0. **Plan.** Read the issue, current `main`, related PRs and code. Report scope, branch, files, tests, risks and acceptance
   criteria. If there is no issue, propose one. Don't take work another agent has claimed on the issue.
   Stop for implementation approval.
1. **Implement locally.** On a `claude/<topic>` or `codex/<topic>` branch or worktree, keeping existing work intact. Run the
   tests. Report the results and the GitHub actions you propose (claim comment, push, PR). Stop for permission to push.
2. **Publish.** Push only the approved branch; create or update only the approved PR, using the template below.
   Report the PR link, commit SHA and CI results. Stop for authorization to start review.
3. **Cross-review.** See below. Explain proposed revisions before pushing them; stop wherever human authorization is needed.
4. **Technical signoff.** When reviews and tests are complete, write a merge-readiness report for the CTO and CEO.
   The CTO signs off technically; a human merges.
5. **Completion.** After a human merges, report the verified outcome and recommend the next issue. Don't start it.

## Cross-review
- **Independent review is required** for changes that touch accuracy, analysis (DSP), scoring or benchmarks, export timing,
  privacy, security, persistence, or significant architecture. When unsure, treat the change as requiring review.
- **Low-risk documentation** may use a simplified process: a human approves it, with or without an agent review.
- The reviewer is the agent that did not build it (Codex reviews Claude Code by default). To ask Codex, a human authorizes
  a `@codex review` comment on the PR. To ask Claude Code, a human asks it in a session to review the PR by number.
- **A review covers only the commit it names.** Any later commit needs a fresh review before signoff.
- The author answers every finding: **fixed** (commit), **disputed** (with evidence), or **deferred** (link to an issue).
  Silence is not an answer. **P0 and P1 findings are never deferred** unless a human explicitly accepts the technical
  risk on the PR; the CTO owns that decision.
- When a review or test catches an agent's mistake, add a line to `docs/AGENT_LOG.md`.

## Reports and handoffs
Every gate report and handoff uses these headings, in order:
```
STATUS:  COMPLETED:  EVIDENCE:  RISKS:  NEXT STEP:  APPROVAL REQUIRED:  HANDOFF TO:
```
End with one recommended next step and a clear stopping point. Older reports in other formats stay as they are.

### Pull request template
```
## What and why
## Evidence      (commands run and their results; CI run; before/after numbers for any analysis change)
## Not verified  (what was not run or could not be checked)
## Risks         (what could break, and who would notice)
## Built by      Claude Code | Codex      ## Reviewed by   (reviewer and the commit SHA reviewed)
```

## Review guidelines
Codex uses this section for `@codex review`; Claude Code uses it for every review.
- **Reproduce** before reporting. Report what you ran and what happened. If you could not run commands, say "tests not run"
  and label each finding *unverified*. Every finding has a severity, a file and line, and a way to reproduce it.
- Severity: **P0** wrong results shown to users, data loss, or private data exposed; **P1** wrong measurement, a test that
  cannot fail, a claim without evidence; **P2** maintainability or clarity; **nit**.
- Check especially: measurement validity (does the metric measure what it claims?), tests that pass for the wrong reason,
  ground-truth leakage between development and holdout data, silent fallbacks, claims in docs or PR text that the evidence
  does not support, changes to gates or thresholds, and anything that would put private data in this public repository.
- Review the code, not the author. Say what is good as well as what is wrong; never approve what you have not read.
