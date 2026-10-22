# 0150: An erased account holds no live role

- Status: Proposed
- Date: 2026-10-21
- Amends: 0011 (erasure is anonymisation in one transaction), for `role_grants`

## Context

Erasure keeps a role grant as governance history: who held which office in which year (0011,
issue 1364), and a revoke refuses a tombstone for the same reason. But it kept the grant *live*.
On 21 Oct 2026 a Committee member closed her own account and her `COMMITTEE` grant, expiring
31 July 2027, stayed live on the anonymised row. The register hid it and no session can act for a
tombstone, so nothing could use it, but the data said an erased account holds an office, and any
reader that forgot to exclude tombstones would count it.

## Decision

**Erasure lapses every live grant at the moment of erasure, in the same batch.** A grant whose
`expires_at` is NULL or still in the future gets `expires_at = now`; a grant that had already
lapsed keeps its own date. The row stays, so the history still reads "held until the day the
account was erased". The statement is guarded on the account not yet being anonymised, like every
other erasure write, so a retry changes nothing.

Migration 0136 lapses the grants left live on accounts erased before this.

The close-account dialogue tells a role holder that their role ends with the account, and its
button stays disabled until the typed address matches, as the IT Manager's erase button already
did. After closing, a notice says the account is closed.

## Consequences

- The register's lapsed view shows an erased officer's grant with the erasure date.
- A merge is unchanged: the loser's grants are reconciled onto the winner before it is
  anonymised (A-123), so nothing is left live to lapse.
