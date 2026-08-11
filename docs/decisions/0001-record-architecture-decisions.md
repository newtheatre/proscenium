# ADR-0001: Record architecture decisions

**Status:** Accepted · **Date:** 2026-08-10 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Proscenium was built and is still maintained by one person; no handover has happened yet, but one
will. The repository has an ordinary incremental commit history, but development ran directly on
`main` — no pull requests, no code review — and until August 2026 there was no documentation beyond
the stock Nuxt starter README. Writing that documentation meant reconstructing intent from the code,
and in several places the code contradicts its own comments, so even that was not wholly reliable.

The theatre's committee turns over every year. Anyone who can answer "why is it like this?" will
have graduated within twelve months. This is the same bus-factor problem the IT estate tracker flags
as critical for this repository.

The `newtheatre/auth` repository already uses ADRs and they work well there.

## Decision

Significant decisions are recorded as ADRs in `docs/decisions/`, numbered sequentially, following
the same format as `newtheatre/auth`: **Status · Date · Deciders**, then **Context**, **Decision**,
**Alternatives considered**, **Consequences**.

Write one when a decision would otherwise have to be reverse-engineered — a schema shape, a choice
between libraries, a deliberate limitation, a rule that lives in one place because it must. Do not
write one for routine implementation.

**Alternatives considered is the section that earns its keep.** A successor who knows what was
rejected and why will not spend a term rediscovering it.

ADRs are immutable once accepted. Superseding one means writing a new ADR that says so, not editing
the old one.

## Alternatives considered

- **Comments in the code** — where it is, but comments describe how, drift silently, and have
  nowhere to put a rejected alternative. Two comments in this codebase already describe rules their
  own code does not implement.
- **The GitHub wiki** — a separate git repository that is not cloned or archived with the code, and
  is invisible in a pull request. The old website repo's documentation lives there and has already
  been half-lost.
- **A page in the committee Shared Drive** — technical decisions belong with the technical artefact.
  Anything in Drive is not seen by whoever is reading the diff.
- **Nothing, as now** — the status quo produced this audit.

## Consequences

**Good.** Decisions survive handover. Reviewing a change means reading its ADR rather than
excavating the code. New committee members have somewhere to start. The format matches the auth
repository, so the estate reads consistently.

**Bad.** It is a habit that has to be maintained, and habits lapse under deadline. Mitigation: the
handover checklist in [08-operations](../08-operations.md) includes reviewing this directory, and
[the docs README](../README.md) names the IT Manager as its owner.
