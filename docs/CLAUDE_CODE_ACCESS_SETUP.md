# Claude Code — access and workspace setup (Track Teardown)

This guide separates three systems:
1. **GitHub** stores the private code and reviewable branches.
2. **Claude Code** is the lead engineering environment; it reads this repository after the founder authorizes access.
3. **ChatGPT** is the external founder/strategy/independent-review environment; it does not share Claude's live session state. Reports, commits and PR links are the handoff.

## Recommended: Claude Code on the web
1. Visit **https://claude.ai/code** and sign in with an eligible Claude account. Claude Code use and limits depend on the Anthropic account plan and environment.
2. Connect GitHub when prompted, or manage the **Claude GitHub App** at https://github.com/apps/claude . GitHub must authorize the private **`ethonnor/ttdown`** repository. Prefer **selected repositories** rather than all repositories.
3. In the Claude Code interface, choose repository `ethonnor/ttdown`. Choose branch **`chore/claude-code-specialists-2026-11`** (until its draft PR is reviewed/merged). The `main` branch currently will not include these files.
4. Start a new session on that branch. Ask Claude to read `CLAUDE.md` and `docs/CLAUDE_CODE_WORKFLOW.md`, list available project subagents, and run **`/track-audit`**. If command discovery isn't immediate, restart/reopen the session; ask Claude to directly read `.claude/skills/track-audit/SKILL.md` and follow it.
5. First results should be a **read-only** code/algorithm/test audit, plus a ChatGPT handoff, **not an algorithm rewrite**. Confirm that the configuration is actually loaded before granting broader permissions.

This GitHub grant is the user's action: a GitHub connection in ChatGPT is **not** automatically a GitHub connection in Claude Code. Do not send access tokens, personal passwords, paid plan credentials or Anthropic keys through chat.

## Local alternative (Windows)
Use an official supported Claude Code installation approach from https://code.claude.com/docs/en/setup rather than copying third-party installers. Use Git for Windows (or WSL, depending on how Claude Code is installed). Authenticate to Claude interactively.

In an existing authorized local clone:
```bash
git status
git fetch origin
git switch --track origin/chore/claude-code-specialists-2026-11
```
If the branch already exists locally, use `git switch chore/claude-code-specialists-2026-11`. Preserve any uncommitted work *before* switching. Start a new Claude Code session from the repository root, inspect available agents and use `/track-audit`. You do **not** need a second repository.

## Optional: GitHub Actions / @claude
Automatic issue/PR mentions, CI triggers and an autonomous GitHub App coding workflow are separate from a Claude Code web session. They may need additional permissions, authentication, secrets and billing, and can run on new events. **None are enabled or configured by this branch.** Do not add a GitHub Actions secret or workflow without explicit founder approval and a cost/security review. For an initial private product, use manual Claude Code sessions and standard reviewed PRs.

## Recommended privacy and governance defaults
- Keep repository **private**, use selected-repository authorization and review permissions before accepting an installation.
- Keep Anthropic API keys, personal-access tokens, audio datasets and rights-cleared private tracks **out of git**. Never commit `.env`, credentials, audio recordings, or personal annotation datasets.
- Never bypass permission prompts, force-push shared branches, merge/deploy or approve code that has not been reviewed.
- Project agents are specialized research workers, **not separate owners**. Their instructions are not a substitute for access controls, code review or runtime sandboxing.
- Default operation: review read-only specialist outputs, have the main Claude session execute known-safe diagnostics, obtain founder approval for consequential code changes, create a draft PR, run tests, and request independent ChatGPT review.

## Verify installation
- [ ] Claude Code can open the **private** `ethonnor/ttdown` repository with the new branch selected
- [ ] `CLAUDE.md` is read in the project session
- [ ] All four names in `.claude/agents/` are discoverable: `architecture-auditor`, `audio-researcher`, `benchmark-engineer`, `code-reviewer`
- [ ] The `/track-audit` project skill is discoverable
- [ ] A small read-only architecture task succeeds
- [ ] No unexpected code changes, new secrets, auto-merges or external uploads occur
- [ ] Report accurately states what was inspected, tested and not tested

## Ownership / handoff
The founder connects the accounts and approves consequential changes. Claude Code is responsible for implementation and evidence collection. ChatGPT can inspect the resulting GitHub commits/PRs and evaluate reports, but it does not automatically receive Claude's internal context or control the Anthropic session.

References: https://code.claude.com/docs/en/sub-agents ; https://code.claude.com/docs/en/skills ; https://code.claude.com/docs/en/claude-code-on-the-web ; https://code.claude.com/docs/en/github-actions .
