# 0231: A bypass records the rota as it stood when the officer acted

- Status: Proposed
- Date: 2026-10-21
- Amends: 0098 (the night report says whether a confirmed shift of the role existed)

## Context

The night report's staffing section flags each role an officer stood in for, "beside a confirmed
bar shift" or "with no confirmed bar shift" (0098, 0111). The second half was worked out from the
rota as it stands when the report is read. On 21 October 2026 the Front of House Manager used the
till at 21:03, when Amy was confirmed on the bar, and ticked the checklist at 21:12, when there was
no duty manager. Amy was then moved from the bar to duty manager. The report, frozen at sign-off,
read "Duty manager: Fen Front stood in … beside a confirmed duty manager shift" and "Bar: … with no
confirmed bar shift": the reverse of the truth, and immutable once signed.

## Decision

**The bypass audit row records, when it is written, which of the venue's performances tonight had
the role confirmed on the rota, and the report reads that.**

- `officerBypassEntry` gains `confirmedPerformanceIds`. The guard fills it from one query scoped by
  the role, the venue and the night, never by a list of ids (0006).
- `reportOfficerBypassesQuery` reads the flag from that list where the row carries one. A row
  written before this change carries none and keeps today's behaviour, reading the current rota.
- The row is still written once per officer, night, venue and role (0044), so the snapshot is the
  rota at the officer's first act in that role. That is the moment the flag is about: whether the
  officer stepped in over somebody who was rostered.

## Consequences

- A rota changed during the evening no longer rewrites the staffing history, and a frozen report
  says what was true when the officer acted.
- Rows from before this change still read the rota as it is now; nothing is backfilled, since the
  rota at those moments is not recoverable.
