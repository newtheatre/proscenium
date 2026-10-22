# 0217: An emergency card is checked as it is typed, and its versions are shown

- Status: Proposed
- Date: 2026-10-22
- Amends: E-113 criterion 1 (what the committee screen shows); issue 1352 (where an address starts)

## Context

The hands-on run of 21 October 2026 found that the card's refusals began in lower case and only
appeared after Save. Each mistake therefore cost a round trip. The table showed when the current
version was filed, but not who filed it, although the docs said it did. Earlier versions,
which the append-only table keeps for exactly this purpose, could not be read anywhere. A venue
with no address for audiences opened its first card blank, with a description saying it started
from that address.

## Decision

- **Refusals are sentences.** Each one starts with a capital letter.
- **The form checks as it is typed.** `emergencyCardProblems()` runs the same `emergencyCardForm`
  in the browser. Each field shows its own first refusal, and **Save as a new version** is
  disabled until there are none. The route still validates.
- **The table says who filed the current version.** It reads "Wed 21 Oct, 21:25, by Tara".
- **Earlier versions can be read.** `GET /api/admin/venues/[id]/emergency-versions` pages them,
  newest first (0005), under the read permission. The screen lists them under **Versions**.
- **A blank start says why.** When there is no address to start from, the address field says so.

## Consequences

- No version is ever edited, so nothing has to be added to keep the history safe.
- Two versions filed in the same second are ordered by id. A person cannot save twice that fast.

## Options considered

- **Show only a diff between versions.** Comparing them is a reader's job. The list shows the
  fields that matter in an emergency.
