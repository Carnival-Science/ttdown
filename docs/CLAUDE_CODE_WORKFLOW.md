# Claude Code implementation + review workflow

This repository uses **Claude Code as the lead implementation environment**. The founder reviews high-impact decisions. ChatGPT is an **independent external reviewer**, not an automatically connected Claude subagent. Exchange findings via copy/paste or reviewed pull-request links; do not pretend agents shared context they have not received.

## Why this setup is intentionally small
Four project-specific, reusable specialist subagents live in `.claude/agents/`:
- `architecture-auditor`: system map, dependencies, architecture and privacy risks (read-only).
- `audio-researcher`: DSP methods, competitors, evidence and licensing (read-only).
- `benchmark-engineer`: read-only inspection of test reliability, data and ground truth; **the lead engineer** runs approved diagnostic commands and records actual measurements.
- `code-reviewer`: independent evaluation of proposed diffs and regressions (read-only).

The main Claude Code session owns changes, interpretation, integration and communication. Delegate only tasks that truly benefit; the specialists aren't a standing committee and should not all run for trivial fixes. No experimental multi-session agent-team mode is required.

## Workflow

1. **Survey**: current branch, `git status`, code, docs, scripts and actual executed behavior. Check for existing active work.
2. **Question and scope**: one clearly defined uncertainty, bug or benchmark objective with measurable acceptance criteria.
3. **Investigate**: choose relevant specialist(s) for *independent read-only research*. The benchmark specialist never executes shell commands; the lead engineer runs safe diagnostic commands and reports results. Ask each for source paths/line numbers, exact test commands, authoritative external links, limitations and confidence.
4. **Decide**: main engineer reconciles disagreements and proposes small alternatives. Ask founder approval *before* significant algorithm or architecture changes, paid services, external audio collection, privacy/security changes, deployment or merge.
5. **Implement**: only approved, narrow work in a feature branch/worktree. Main engineer handles the production code.
6. **Validate**: test actual behavior with unchanged baseline vs candidate where relevant; capture full exit status, metrics, runtime and counterexamples. Label tests not run. Prefer real-world rights-cleared holdout tests before claiming analysis improvements.
7. **Review**: delegate code diff to `code-reviewer`, reconcile findings, preserve a known-good version.
8. **Handoff**: communicate a full end-of-session audit using the format below and explicitly identify decisions for the founder.

## Required report / handoff

Use the following headings for **each substantial development share**. Briefly indicate `Not applicable` rather than silently omitting a heading.

### 1. CEO Summary
What changed in confidence about Track Teardown? What should be done next?

### 2. Objective and Environment
Branch, base/HEAD commit, working tree status, scope, runtime/tool constraints.

### 3. Investigation
Files/functions checked with line references; algorithms or competitors examined; why those sources were chosen.

### 4. Findings and Evidence
A short table or concise sections: **claim | supporting file/line or URL | verification status (observed / inferred / unverified)**. Separate measured behavior from speculation.

### 5. Decision and Alternatives
Options considered, rationale, tradeoffs, dependencies, and whether CEO approval was obtained or is required.

### 6. Changes Made
Exact files modified, concise behavioral description, commits/PR URL if any; explicitly say if **no code was changed**.

### 7. Tests and Baseline
For every actually executed command: exact command, environment, exit status, result and important failing cases. State **not run** for the rest. Never present synthetic song tests as real-mix accuracy. For Version A/B, use identical track IDs, annotations and metrics; report regressions.

### 8. Risks, Limitations and Self-Audit
Top uncertainties, flaws, assumptions, security/privacy and licensing considerations, potential regressions, evidence that could change your conclusion.

### 9. Ranked Next Steps
Three to five steps, prioritized by **uncertainty or accuracy risk reduced**, with a measurable completion condition.

### 10. CEO Decisions Needed
List only decisions that materially affect scope, quality, spending, security or production. Note when none.

### 11. Paste This into ChatGPT — Independent Review Handoff
Produce a **self-contained** brief containing:
- Repo and exact branch/commit/PR link.
- Current objective and product constraints (professional multi-genre, electronic first, accuracy-first).
- Findings with evidence links or file/line references.
- Changes made and tests *actually run*, including failures/untested items.
- Recommended next change and why.
- Open technical disagreements, blockers and risks.
- Explicit questions for independent evaluation.

The handoff must allow ChatGPT to verify the reasoning without relying on Claude's hidden session history. Avoid megadumps of logs; include crucial excerpts or reproducible links.

## Activation and access

See `docs/CLAUDE_CODE_ACCESS_SETUP.md` for Claude Code web/desktop access and GitHub App connection. The initial read-only investigation can be invoked with `/track-audit` in Claude Code. No GitHub Actions authentication secret is necessary for browser-based Claude Code; automated `@claude` workflows are a separate, optional integration.

## Suggested first Claude Code instruction

> Read `CLAUDE.md` and `docs/CLAUDE_CODE_WORKFLOW.md`. Confirm your current branch and dirty-file state. Use `architecture-auditor`, `audio-researcher` and `benchmark-engineer` for a read-only first-pass investigation of the existing analyzer and benchmarks. The benchmark subagent must not run shell commands; as lead, run only safe existing diagnostics where permissions and the environment permit. Do not edit DSP or architecture yet. Reconcile the specialists' evidence, rank the most important gaps, and return the complete 11-section report plus a proposed Version A accuracy-baseline experiment. Be candid about tests you could not run.

## Activation / verification
1. In Claude Code on the web, choose `ethonnor/ttdown` **and select the branch containing this configuration** using the branch selector. Alternatively, check out that branch in a local Claude Code repository session.
2. Restart Claude Code if the `.claude/agents/` directory did not exist when the session began.
3. Ask Claude Code to list available project subagents and explicitly invoke one (for example, `architecture-auditor`) for a read-only small-scope task.
4. If it cannot load an agent, run `claude doctor` or inspect the agent frontmatter and runtime configuration. Do not assume this configuration was tested merely because the files exist on GitHub.

No special API keys, paid tools, global user settings, or experimental agent teams are configured by this commit.
