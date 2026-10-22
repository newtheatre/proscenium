# 0210: A role nobody can take is closed, and a locked candidate says why

- Status: Proposed
- Date: 2026-10-21
- Amends: issue 1318 (the readiness card), E-107 criterion 5 (adding a shift naming somebody);
  extends 0115

## Context

The hands-on run of 21 October 2026 started from an empty database. The duty manager role read
**Open: Unlocked by Committee Operations and Governance (ADMN-201)** on the readiness card, yet
nobody could take a duty manager shift: 0115 also asks for a live committee role, the officers held
committee roles but not ADMN-201, and the one volunteer who held ADMN-201 held no committee role.
Every candidate in the assign dialogue read **Locked** with no reason, the volunteer was never told
why duty manager shifts never appeared, and two performances that night had no duty manager.

The same run found that **Add a shift** naming somebody skipped the one-shift-per-performance rule
that **Assign** enforces: a volunteer was confirmed on a door and a bar shift on one performance.

## Decision

**A role reads Open only when somebody could be put on its shift now.** The readiness route counts,
per role, the usable accounts that the role's confirming write would admit (`qualifiedCountQuery`,
built from the same `holdsGate` and, for a duty manager, the same committee role). A role with a
published module and a count of zero reads **Closed** and says what would change it: for a duty
manager, sign off ADMN-201 for a committee member, or give a committee role to somebody who holds
it. The duty manager's module line names the committee role beside the module. The console's
set-up list carries the same line, so a new IT Manager meets it before the first night.

**A locked candidate says why.** Both candidate searches return a `reason` beside `eligible`, from
`candidateLock()`, checked in the order the write checks: no module named, then the committee role,
then the module, then another shift on the same performance. The dialogue prints it beside the
badge.

**A member who holds the training but not the committee role is told.** `/api/rota/roles` returns
`committeeOnly`, and Rota shows a note that duty manager shifts are for committee members. This is
not a card among "Roles you could take", since no training opens the role for them (0115).

**Adding a shift naming somebody holds them to one shift per performance.** The insert carries the
assignment's `NOT EXISTS`, so the rule rides the write (0003), and a refused insert from somebody
otherwise eligible answers the assignment's 409.

The rule of 0115 is unchanged: a duty manager still needs both.

## Consequences

- The count is three scalar reads per readiness request, each with a fixed parameter count (0006).
- The console overview gains one line kind, `NOBODY_QUALIFIES`.
- A clash across two performances on one night is a separate question, not settled here.

## Options considered

- **Let the IT Manager waive the committee role for a first night.** It reopens what 0115 closed,
  and a fresh install has an IT Manager who can grant the role in a minute once told to.
- **Seed a committee member holding ADMN-201.** There is no real person to seed, and a seeded record
  would be a training record nobody taught.
