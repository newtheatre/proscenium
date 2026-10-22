# 0218: A Challenge 25 description that may be a name is flagged, never refused

- Status: Proposed
- Date: 2026-10-22
- Amends: E-118 criterion 2 (what keeps a name out of the register)

## Context

The register "never names the person checked", and the forms already say "Appearance, never a
name". The hands-on run of 21 October 2026 still found an entry described as "Harry Holloway".
That register is exported to licensing inspectors. The schema cannot tell a name from a
description, and the old comment said so.

## Decision

**A description that reads like a name gets a warning.** `looksLikeName()` matches two capitalised
words in a row, or a title such as Ms or Dr before a capital. The log and correct forms on Tonight
and the till's Challenge 25 sheet show a warning under the field as it is typed. The register marks
a matching entry **May name somebody**, so the officer can correct tonight's before exporting.

**It never refuses.** "Blue Nike hoodie" trips the same pattern, and a refused age check at a busy
bar is worse than a warning.

## Consequences

- An entry already recorded is flagged on the register. Only tonight's can be corrected, through the
  existing correction, which is itself append-only.

## Options considered

- **Refuse a match.** False positives would block real checks.
- **Match against the members' names.** The person checked is usually not a member, and doing so
  would put the member list into the check.
