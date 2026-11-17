# G1a two-track pilot intake

Prepared 17 November 2026. Status: templates only; no contributors contacted, files received, private audio accessed, rights verified, or pilot results produced.

Basis: `docs/G1A_PILOT_CHECKLIST.md` and `bench/README.md` at PR #4 head `6a952de4181228992b66b61253b63c957ecf5cc8`. Reconcile against the final integration revision before operational use.

This is a two-track rehearsal within the planned 12-track G1a development pilot. Both tracks remain development data permanently. It does not satisfy the 12-track selection or coverage milestone, establish real-world accuracy, or authorize outreach or data access.

## Readiness before intake

Record the founder's written decision and reference for each item; all are pending.

| Decision | Required record | Status |
|---|---|---|
| Source and rights | Approved source; agreement reviewed under existing checklist; internal evaluation scope; no training or redistribution; aggregate publication terms | Pending |
| Storage | Encrypted restricted storage outside Git; named access list and backup; no third-party processing | Pending |
| Retention | Retention deadline; deletion-request procedure and response interval; backup handling | Pending |
| Resources | Approved staffing/time plan; fees require separate authorization; this preparation authorizes no spending | Pending |
| Roles | Founder, data lead, A/B annotators, adjudicator, engineer and independent future holdout custodian | Pending |
| Registry | Private artist ID/alias registry outside Git | Pending |

Annotators must be independent, must not be the engineer or data lead for the track, and must not see analyzer predictions. The adjudicator must not be an annotator for that track. Resolve role eligibility before files are assigned.

## Preselect two slots before analyzer exposure

Suggested provisional slots: `g1a-01`, House baseline with four-on-the-floor and clap on 2/4; `g1a-02`, Techno without clap/snare on 2/4. These are slot suggestions, not selected tracks. The founder/data lead must confirm slots and candidate titles before collection. Document any deviation without using analyzer results to choose or drop tracks.

Each track must be a 2–8 minute final master in 4/4, from a source able to grant the required rights. Use distinct artists, releases and song families; include collaborators/remixers when checking identity. The full 12-slot plan remains in force for later expansion.

| Field | g1a-01 | g1a-02 |
|---|---|---|
| Slot, condition and candidate title (before receipt) | Pending | Pending |
| Contributor/rights source and agreement ID | Pending | Pending |
| Written permissions, restrictions and approval reference | Pending | Pending |
| Receipt date and data lead | Pending | Pending |
| Restricted storage reference and access list | Pending | Pending |
| Final master WAV/AIFF, sample rate/bit depth/duration | Pending | Pending |
| Every file: relative path, byte size, SHA-256, receipt date | Pending | Pending |
| Stems/MIDI/project availability and permitted uses | Pending | Pending |
| Contributor tempo/key/metre (metadata, not truth) | Pending | Pending |
| All credited artists and artistIds | Pending | Pending |
| Registry alias review/version/hash | Pending | Pending |
| Release identifier and songFamily | Pending | Pending |
| Style/tempo/swing/intro/tonality/vocal/sub-kick tags | Pending | Pending |
| Original read-only copy and backup verification | Pending | Pending |
| Retention/deletion date and procedure reference | Pending | Pending |
| Eligibility/identity review and outstanding issues | Pending | Pending |

Do not place names, agreements, storage URLs, audio, private registries or real annotations in the public-facing preparation documents or Git. Complete sensitive records only in approved storage. Missing rights or identity information blocks intake; do not substitute invented values.

## Handoff to annotation

For each track, record authorized storage readiness, complete hashes, role eligibility, source alignment evidence and annotation assignment dates. Keep A and B work separate. Preserve originals; perform annotation on approved working copies. Use `G1A_TWO_TRACK_ANNOTATION.md` for formats and QA.

Freeze a manifest only after adjudication. Paths are relative to the manifest outside Git. Set `split: "dev"`, `version: 1`, `annotationProtocol: "v1.0"`, audio `sha256`, per-file `annotationSha256`, `artists`, `artistIds`, `release`, `songFamily`, rights references and condition tags. Require checksums, continuousBeats and identity; require beats/downbeats/key on all tracks. Preserve the existing chord share of 0.3, which requires at least one of two tracks; preselect a suitable harmonic slot or document a blocked requirement. No executable manifest with placeholder hashes is supplied.

Check identifiers using the actual registry. Comparing with an empty holdout manifest checks identifier readiness only; it cannot prove separation from an unknown future holdout. At final holdout assembly the independent custodian must compare all development identities against holdout. Do not request or access holdout data during this preparation.
