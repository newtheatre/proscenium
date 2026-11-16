# 8. Test plan

Identity is tested mostly at the integration tier, against a real local D1, because nearly every rule is a guard on a write. The named cases below must never regress: each is a rule whose failure is a security or privacy incident.

## What each tier covers

| Tier | Covers | Examples |
| --- | --- | --- |
| Unit | Pure functions | Address normalising, token hashing and comparison, expiry dates across the year end and clock changes, the resolver's decision given a prepared set of grants and facts |
| Integration | Routes and services against D1 | Every guard, every state change, merge and erasure end to end, settings rules |
| End to end | A browser, with a virtual authenticator for passkeys | The sign-in journeys, the header in each state, re-assertion completing an action, the phone layouts |

## Never-regress cases

### Getting in

| Name | Tier | Asserts |
| --- | --- | --- |
| `sign-in link works once` | Integration | A second use signs nobody in, even in a race of two requests |
| `sign-in code is bound to its browser` | Integration | The right code from another browser is refused and counts as an attempt |
| `sign-in reveals nothing` | Integration | Response body, status and timing class are the same for a known and an unknown address |
| `no account before proof` | Integration | Asking for a link writes no account row |
| `unverified provider address links nothing` | Integration | A provider identity with an unverified email is refused |
| `managed domain never gets a link` | Integration | No email is sent and no token written for an address in a managed domain |
| `unclaimed account is never an actor` | Integration | No session can be created for an account that has not signed in |
| `tokens are stored hashed` | Unit | No table holds a value a token can be derived from |
| `return address stays on site` | Unit | Absolute, protocol-relative and encoded addresses are all dropped |
| `recovery session can only enrol` | Integration | Every other route refuses a recovery session |
| `break-glass is shut without its secret` | Integration | The route answers not found when the secret is unset |

### Sessions and assurance

| Name | Tier | Asserts |
| --- | --- | --- |
| `ended session stops on next request` | Integration | No cache keeps a revoked session alive |
| `disable ends every session` | Integration | Same batch as the disable |
| `privileged ability refuses a basic session` | Integration | Walks the ability registry; every privileged route is tried |
| `email cannot make a session strong` | Integration | A link or code never raises assurance |
| `re-assertion completes the same action` | End to end | The submitted form is carried through unchanged, once |

### Roles and grants

| Name | Tier | Asserts |
| --- | --- | --- |
| `nobody grants themselves` | Integration | At every scope, by every route including renewal |
| `give only what you hold` | Integration | Role editing and granting both refuse an ability the actor lacks at that scope |
| `last Owner survives` | Integration | Ending, disabling, merging and erasing, including two concurrent requests |
| `only an Owner changes an Owner` | Integration |  |
| `grant is never edited` | Integration | The trigger refuses an update other than setting the end |
| `expired grant counts for nothing` | Unit and integration | At the instant of expiry, London time, across both clock changes |
| `pending grant counts for nothing` | Integration | A grant on an unclaimed account allows nothing |
| `scope does not leak` | Integration | A grant on one production allows nothing on another or at site level |
| `fact never carries a privileged ability unconfirmed` | Integration |  |
| `every route declares its guard` | Unit | Walks the route table; a route with no declaration fails the build |

### Audience and members

| Name | Tier | Asserts |
| --- | --- | --- |
| `members' address is not found without a standing` | Integration | Walks every route in the member shell as an audience account and signed out; each answers exactly as a missing page does |
| `public bundle holds no member screens` | Unit | Build output check on the public shell's chunks |
| `audience email names no member feature` | Integration | Every template rendered for an account without a standing |
| `standing opens the area without signing in again` | End to end |  |
| `losing a standing touches nothing else` | Integration | Orders and sessions are unchanged |
| `header shows the right entries` | End to end | Four states, at phone and desktop widths |

### Merge

| Name | Tier | Asserts |
| --- | --- | --- |
| `merge misses no reference` | Integration | Built from the registry: seeds a row in every account-referencing column of every enabled module, merges, and finds none pointing at the old account unless declared alias |
| `merge is all or nothing` | Integration | A failing handler leaves both accounts exactly as they were |
| `alias resolves everywhere` | Integration | `canonicalAccount` and every label lookup return the survivor |
| `merge refuses a tombstone and itself` | Integration |  |
| `undo restores only what moved` | Integration | Rows written after the merge stay with the survivor |
| `new account-referencing column must declare its merge rule` | Unit | Schema check; an undeclared column fails the build |

### Erasure and privacy

| Name | Tier | Asserts |
| --- | --- | --- |
| `erasure leaves no personal value` | Integration | Built from the data-class registry: seeds every personal column for one account, erases, and scans every table for the seeded values |
| `erasure is idempotent` | Integration | A second run writes nothing |
| `hold stops erasure` | Integration | While any module holds, nothing is cleared |
| `erased address is free again` | Integration | A new sign-up with it makes a new account with no link to the old |
| `tombstone is never an actor or a target` | Integration | No sign-in, grant, merge or order attaches to it |
| `audit detail holds no personal text` | Unit | Every audit call's detail type admits identifiers only |
| `sensitive read is audited` | Integration | Emergency contacts and access profile, every route |
| `sweep reports only until armed` | Integration |  |
| `sweep respects its cap and its exclusions` | Integration |  |

## How the walking tests stay complete

Five of the cases above are generated from a registry (routes, abilities, account references, data classes, email templates) and not written by hand. A module added later is covered the day it is enabled, and a column or route that declares nothing fails the build. This is the answer to the lesson that a hand-kept list of tables to merge or erase always falls behind.

## Fixtures

| Fixture | What it is |
| --- | --- |
| The cast | One account in each state: unclaimed, audience, member by fact, staff with a site role, staff with one production, Owner, disabled, alias, tombstone |
| The clock | A settable clock for every expiry, with cases at the year end and both clock changes |
| The authenticator | A virtual passkey device for end-to-end and a signing helper for integration |
| The mailbox | Captures outgoing email so a test can follow a link or read a code |

## Not tested here

- The passkey library's own cryptography: trusted, pinned and updated.
- Google's side of sign-in: a stub provider stands in; one manual check per release against the real one.
- Load: the foundations thread owns the performance proofs.
