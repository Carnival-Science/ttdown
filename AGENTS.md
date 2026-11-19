# Teardown: rules for AI coding agents

This file is read automatically by **Codex** (`AGENTS.md`) and by **Claude Code** (through `CLAUDE.md`, which imports it).
`app/AGENTS.md` adds rules for the Svelte app. `docs/ROADMAP.md` is the living plan. `docs/AGENT_LOG.md` lists past agent
mistakes: read it before starting work.

GitHub (issues, pull requests, review comments) is the shared record. No agent can see another agent's chat, so anything
another agent or a human needs must be written on GitHub.

## Roles
- **CEO:** final authority over business decisions and engineering workflow approvals. May authorize implementation,
  commits, pushes, PRs, merges and deployments; may expressly delegate one specific merge to a connected AI agent; accepts
  documented engineering risks.
- **CTO** (`samanshaiza004`): technical advisor and engineering collaborator. Recommends architecture, accuracy and security
  improvements and is consulted when the CEO asks for technical input. Not a required approval for any PR.
- **Claude Code:** primary implementation, within the scope the CEO approved. Does not start unrelated work.
- **Codex:** independent reviewer, especially for accuracy, analysis (DSP), security, privacy, data integrity and substantial
  architecture changes. Reports confirmed findings and remaining risks. Implements only when the CEO assigns it a task.
- Other AI advisors have no repository access. Their advice counts only once a human posts it on GitHub.

The CEO decides; agents build, review and report. An agent's approval is advice, not permission to merge.

## Priorities
Accuracy first, explainability second, workflow third, UI polish last. An unmeasured improvement is not an improvement.

## Hard rules
1. **Changes reach `main` through pull requests.** Agents never push to `main` and never merge on their own.
   A connected agent may execute one specific PR merge only when the CEO expressly authorizes it. This file grants agents
   no permission to deploy: deployments need separately defined authorization and governance. Humans also use PRs.
   Emergency exception (humans only): a direct push to `main` to stop a broken production deploy or a private-data
   exposure, followed within one working day by an issue or PR that records what was pushed and why. Branch protection is
   configured by humans, never by an agent, and no one bypasses existing GitHub protection.
2. **One branch per agent and task.** Claude Code uses `claude/<topic>`, Codex uses `codex/<topic>`. Never push to another
   agent's or a contributor's branch, never force-push or rewrite shared history without the CEO's explicit authorization,
   and never change unrelated work by others. To change someone else's branch, comment or open a PR that targets it.
3. **Never fabricate.** Every claim of "tested", "passes", "faster" or "more accurate" names the exact command and its result,
   or a CI run, commit, or file. If something was not run, write "not run". If it could not be checked, write "not verified".
4. **This repository is public.** Confidential recordings, stems, DAW sessions, private annotations, rights documents,
   contributor information, credentials, tokens and personal data never enter it, in any commit, issue, PR or log.
   Real-music data lives outside GitHub (see issue #36). Synthetic and redistribution-cleared test fixtures may be
   committed once the CEO approves them, with their generator or licence recorded next to them.
5. **Analysis (DSP) changes** are measured against the pinned Version A with the benchmark (`npm run benchmark`,
   `npm run bench:synthetic`, `npm run bench:parity`), reporting before and after numbers, including regressions.
   Never change a benchmark, gate, threshold or ground-truth file to make a result pass.
6. **Reproduce before fixing.** A bug fix includes a test or command that failed before the fix and passes after it.
7. **Act only within authorized scope.** GitHub actions (claim comment, issue, push, PR, review request, merge) and anything
   outside the repo (organization settings, apps, permissions, secrets, deployments, other repos) need the CEO's
   authorization. If the scope is unclear or the work needs more than was authorized, stop and ask.

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

## Workflow
1. **Approve.** The CEO approves the task and defines its scope. If asked for a plan first, report scope, branch, files,
   tests, risks and acceptance criteria. Don't take work another agent has claimed on the issue.
2. **Implement and validate.** On a `claude/<topic>` or `codex/<topic>` branch, keeping existing work intact. Run the tests.
3. **Review.** Significant changes get independent review as their risks require (see Cross-review).
4. **Record.** The PR (template below) records the changes, CI results and review findings.
5. **Merge decision.** The CEO decides. Before that, the agent discloses every material unresolved accuracy, privacy or
   security risk.
6. **Merge.** A human merges, or a connected agent executes that specific merge when the CEO expressly authorizes it.
7. **Verify.** Engineering checks the result on `main`, reports it, and recommends the next task without starting it.

The CEO may authorize several steps in one explicit instruction for a defined task. Don't ask again for actions already
authorized; stop and report when the authorized scope ends.

## Cross-review
- **Independent review is required** for changes that touch accuracy, analysis (DSP), scoring or benchmarks, export timing,
  privacy, security, data integrity, persistence, or substantial architecture. When unsure, treat it as requiring review.
- **Low-risk documentation** may use a simplified process: the CEO approves it, with or without an agent review.
- The reviewer is the agent that did not build it (Codex reviews Claude Code by default). Reviews are requested with the
  CEO's authorization: a `@codex review` comment on the PR for Codex, or a session request by PR number for Claude Code.
- **A review covers only the commit it names.** Any later commit needs a fresh review before the merge decision.
- The author answers every finding: **fixed** (commit), **disputed** (with evidence), or **deferred** (link to an issue).
  Silence is not an answer. **P0 and P1 findings are never deferred** without the CEO's explicit acceptance of the risk,
  recorded on the PR.
- When a review or test catches an agent's mistake, add a line to `docs/AGENT_LOG.md`.

## Reports and handoffs
Every report and handoff uses these headings, in order:
```
STATUS:  COMPLETED:  EVIDENCE:  RISKS:  NEXT STEP:  APPROVAL REQUIRED:  HANDOFF TO:
```
When another agent or a human must act, also give WHERE TO GO, WHY, WHAT TO COPY AND PASTE (a complete, ready-to-send
prompt) and WHAT TO BRING BACK. End with one recommended next step and a clear stopping point. Older reports stay as they are.

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
- Report confirmed findings and the risks that remain. Review the code, not the author. Say what is good as well as what is
  wrong; never approve what you have not read.
