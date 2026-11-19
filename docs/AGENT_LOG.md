# Agent mistake log

Read this before starting work. Add a line whenever a test, a review or a human catches a mistake made by an AI agent
(Claude Code or Codex). The goal is to stop repeating mistakes, not to keep score. Only record what actually happened,
with a link to the evidence.

| Date | Agent | Mistake | How it was caught | Rule to avoid it |
|---|---|---|---|---|
| 2026-11-17 | Claude Code | The G1-H annotation loader treated `#` as a comment anywhere on a line, so "F# minor" and sharp chords were cut off. | Claude Code's own tests while building the harness. | Test parsers with real musical text (sharps, flats, commas) before relying on them. |
| 2026-11-17 | Claude Code | `bench/score.js --rescore` scored a track whose audio had changed since its prediction, and a repeat re-score overwrote an earlier revision result. | External review (ChatGPT); reproduced with negative tests before fixing (commit 6a952de). | Any re-run of an evaluation must check that its inputs are unchanged and must never overwrite an earlier record. |
| 2026-11-17 | Claude Code | A `sed` edit inserted literal newlines into the test-song generator. | Running the generator after the edit. | Use an exact-match editor for multi-line changes, and run the affected script right after editing it. |
| 2026-11-17 | Claude Code | A background script that waited for CI read every run ID instead of one, and reported nothing useful. | The script's own error output. | Select exactly one CI run, by commit SHA, before waiting on it. |
| 2026-11-18 | Claude Code | Asked the founder twice to enter a verification code in the in-app browser before checking that the browser pane was hidden. | The pane state, checked on the third attempt. | Check that a page is visible to the user before asking them to act on it. |

No Codex entries yet: Claude Code has not yet reviewed Codex work under this process.
