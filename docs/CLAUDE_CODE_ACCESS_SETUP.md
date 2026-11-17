# Claude Code — local-first workspace setup (Track Teardown)

## Current reality: Claude Code is already connected locally

The founder's **existing Claude Code session runs on their own computer** and reports working Git pushes and GitHub CLI authentication as `ethonnor`. That is sufficient GitHub access for the current engineering workflow. **Do not request new web/cloud authorization, GitHub app installation, personal access tokens or API keys for the local workflow.** This document is a repo guide, not a way to manage personal credentials.

Three systems share one private repository:
1. **GitHub** stores `ethonnor/ttdown`, feature branches, tests and PR reviews.
2. **Local Claude Code** is the lead implementation environment and can use the computer's existing Git/GitHub CLI authentication. It should load repository instructions and specialist agents from the local checkout.
3. **ChatGPT** performs independent strategy and technical review via the existing GitHub connection. It cannot automatically see local Claude's session or files not pushed to GitHub.

## Safely add this configuration to the existing local Claude workspace

The specialized agents and the `/track-audit` skill are on the separate **draft PR #3** branch `chore/claude-code-specialists-2026-11`. Claude's measurement work is on **PR #2** branch `g0-measurement`. Avoid switching away from the current worktree if there are uncommitted changes or an active task.

**Recommended approach:** finish and review the in-flight measurement work first. Review PR #3, then merge it to `main` once the founder approves. From the local clone, Claude can fetch and incorporate the approved configuration into its next work branch, or start a fresh worktree from the updated `main`. This avoids grafting agent/config files into the in-progress measurement diff and avoids accidental changes to unrelated files.

**If you want the agents immediately before PR #3 is merged:** use a *separate local worktree* from the PR #3 branch. From the correctly identified top-level repository root, after confirming `git status` and that the branch ref exists:

```bash
git fetch origin
git worktree add ../ttdown-agent-setup origin/chore/claude-code-specialists-2026-11
```

Open that worktree as a **separate Claude Code local session**. This leaves `g0-measurement` intact. The local folder name is illustrative; check for path collisions. Beware: the current codebase's engineering audit reported an **outer repository plus inner `ttdown/` clone/gitlink**. Before using any commands, Claude should verify which folder is the actual repository and which working tree owns `g0-measurement`. Never run destructive cleanup or nested git commands based on assumptions.

In the separate session, read `CLAUDE.md`, verify the four named project agents under `.claude/agents/`, and invoke `/track-audit`. If Claude Code doesn't discover an agent, restart the local session and inspect agent frontmatter/installation. If the skill isn't discovered, read `.claude/skills/track-audit/SKILL.md` directly.

## Account/plan: only if you choose cloud sessions later

Claude Code on the web at https://claude.ai/code is **optional**. It uses an Anthropic-hosted environment, so it may require its **own** GitHub authorization, even when local GitHub CLI access works. Use the Claude GitHub App's selected-repository setting if enabling cloud access. This is unnecessary for current local development.

GitHub Actions automation, an `@claude` PR assistant, or scheduled unattended sessions are **separate optional integrations**, may require secrets and billing, and are **not enabled** by PR #3. Don't add them until the founder approves the cost/security/release process.

## Verification checklist

- [ ] Identify real local repo root, current branch, and `git status` before touching files; avoid confusing outer/inner clones.
- [ ] Preserve PR #2's in-progress `g0-measurement` work without uncommitted changes being overwritten.
- [ ] The session using PR #3's configuration loads `CLAUDE.md`.
- [ ] Claude Code discovers `architecture-auditor`, `audio-researcher`, `benchmark-engineer` and `code-reviewer`.
- [ ] The `/track-audit` project skill is discoverable and completes a small read-only audit.
- [ ] Benchmark specialist cannot execute commands, while the main Claude engineer can run approved known-safe diagnostics.
- [ ] No production code, authorization settings, credentials, private tracks, deployment or merges were changed by setup verification.
- [ ] Reports include evidence, exact test commands/results, uncertainty, self-audit and pasteable ChatGPT handoff.

## Privacy and governance

Keep repo private; never commit GitHub tokens, Anthropic credentials, `.env`, personal datasets or rights-cleared reference audio. Subagent instructions are **not** a security sandbox. Founder approves significant algorithm changes, merge/deploy and third-party audio services. The main Claude engineer integrates changes and ensures test exit codes are meaningful. ChatGPT reviews pushed commits/PRs, not hidden session context.

Official references: https://code.claude.com/docs/en/setup , https://code.claude.com/docs/en/sub-agents , https://code.claude.com/docs/en/skills , https://code.claude.com/docs/en/claude-code-on-the-web .
