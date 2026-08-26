# 0010: Append-only registers are trigger-enforced

- Status: Accepted
- Date: 2026-08-26

## Context

The old estate kept its incident log, Challenge 25 register, stock movements, price history
and audit trail append-only, enforced by database triggers, and its migration tooling refused
generated migrations that would rebuild such a table. These records are licensing evidence,
financial evidence and safety history; a quiet edit to any of them is worse than an error.

## Decision

The unified schema declares its append-only set up front: the ledger (0004), stock movements,
incident log, age-check register, price history, training records and the audit trail.
Triggers refuse UPDATE and DELETE (with the narrow, named exceptions each table documents,
for example audit redaction on erasure). Corrections are superseding or reversing entries that
reference what they correct. CI refuses a migration that rebuilds an append-only table.

## Consequences

- Mistakes remain visible with their corrections, which is the property inspections and
  arguments both need.
- The migration imports the old registers losslessly, checksummed, with original timestamps,
  and they become append-only again from the moment of import.
