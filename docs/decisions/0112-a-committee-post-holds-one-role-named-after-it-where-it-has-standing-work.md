# 0112: A committee post holds one role, named after it where it has standing work

- Status: Accepted (IT Manager, 29 September 2026)
- Date: 2026-09-29
- Amends: 0028 (whose story the audit trail is), 0090 (the other pairings the #1211 audit raised
  are decided here), and 0102 (its consequence that the Manager still holds `money.refund` lapses)

## Context

The 2026/27 constitution has eighteen posts, held by twenty-one people (4). The system had
eleven roles, then ten after 0090 and nine after `FRONT_OF_HOUSE` retired (A-134). Three matched a
post (the Treasurer, the Front of House Manager, the Theatre Manager); `MANAGER`, `BAR_MANAGER`,
`TRAINING_MANAGER`, `SAFETY_OFFICER` and `ACCESSIBILITY_OFFICER` matched none. The live Front of
House Manager held four grants for one post, and the posts with standing work in the system held
nothing, so only the IT Managers could reconcile takings, follow incidents up, verify access
declarations or read the audit trail. The role audit against the constitution, posted on issue
#1211 on 28 September 2026, sets out the reasoning clause by clause; this record takes its design.

## Decision

**Seven roles.** `ROLES` is `ADMIN`, `PRESIDENT`, `SECRETARY`, `TREASURER`, `FOH_MANAGER`,
`THEATRE_MANAGER` and `COMMITTEE`:

| Role | Title | Held by |
|---|---|---|
| `ADMIN` | IT Manager | The Archivist (4.17.1, 4.17.2) and the delegate the Archivist brings in (4.17.1) |
| `PRESIDENT` | President | The President (4.1) |
| `SECRETARY` | Secretary and Welfare Officer | The Secretary (4.2) |
| `TREASURER` | Treasurer | The Treasurer (4.3) |
| `FOH_MANAGER` | Front of House Manager | The Front of House Manager (4.4), with the bar (0110) |
| `THEATRE_MANAGER` | Theatre Manager | The Theatre Manager (4.11), with safety and training (0111) |
| `COMMITTEE` | Committee | Every other post, with the post named in the grant's note (A-118 criterion 2) |

**Every post role carries the Committee's standing.** Each holds `finance.summary` and
`reports.read`, and `COMMITTEE_ROLES` (the five post roles and `COMMITTEE`, never `ADMIN`) is what
"the Committee" means. A stored list naming `COMMITTEE` reaches every post holder: the tab roles
(F-108), the announcement audience (H-108), the night report recipients (E-124) and the directory's
role filter. `ADMIN` is a function its delegate may hold without a post, so it is not committee
standing.

**`PRESIDENT` is new.** Oversight and accountability of committee members (4.1.2) make J-103's
audit trail the President's story (`audit.read`, `audit.write`, `accounts.read`). Shared
responsibility for safety (4.1.1) gives `safety.read`, which opens the open-items list with each
incident's written account, which can describe an injury. This is a deliberate widening of who
reads health data, and it is named here. The President grants nothing: they nominate acting holders
(7.8.2) and an IT Manager records the grant, so the person who decides cover is not the one who
records it.

**`SECRETARY` replaces `ACCESSIBILITY_OFFICER`.** The constitution assigns access verification to
nobody. The Secretary is "the official welfare officer" and the members' first contact (4.2.1), and
nobody outside the Committee may act as Secretary (7.8.2), so verification (`access.verify`, special
category data under 0050) sits with the welfare officer and never with the box office (D-127
criterion 2). The role also reads the fellowship roll, since the Secretary runs the fellowship
meeting (3.7.1, 4.2.3).

**`MANAGER` retires.** It matched only the old estate's `proscenium:MANAGER` and
`ticketing:MANAGER` and held no live grant. Its `money.refund` is the Front of House Manager's
(0102), its rooms and training the Theatre Manager's (0111), `audit.*` the President's, and
`fellowships.write`, `members.write` and `ticketing.manage` the IT Manager's alone. Deciding
membership claims is the IT Managers' until the queue's volume after cutover is known.

**Grants move in one migration, in the same change as the vocabulary**
(`0130_the_retired_roles_fold_into_the_post_roles`). `role_grants` is not append-only (A-118,
A-119), so rows update in place and 0010's refusal does not apply; D1 runs the file as one
transaction.

1. A guard fails the file, writing nothing, when a live grant of a retiring role would land on the
   wrong post or lose access: its holder holds neither the live post role (`FOH_MANAGER` for the
   bar, `THEATRE_MANAGER` for safety and training) nor an `ADMIN` grant lasting at least as long.
   A `MANAGER` grant always needs `ADMIN`. A person then decides that grant by hand (0070).
2. A lapsed grant of a retiring role gives nothing and is removed, audited as `role.retired`.
3. Every other grant is audited first as `role.merged`, while it reads as it stood: no actor and no
   free text (0011).
4. A grant folds into the holder's live post grant, which takes the later expiry, a permanent grant
   beating any date, and re-arms its lapse warning (A-119). An accessibility grant folds into the
   holder's Secretary grant, or is renamed to it, since the one replaces the other.
5. What is left is covered by the holder's `ADMIN` grant, as the guard checked, and is deleted.
6. A `COMMITTEE` grant is removed, audited, where its holder holds a post role expiring no earlier.
   One that outlives its post grant is kept, and so is one beside `ADMIN` alone.
7. The role-keyed settings (`BAR_AUTHORISED_TAB_ROLES`, `NIGHT_REPORT_ROLES`, `PRIVILEGED_ROLES`) are
   read as written, so a retired name would silently end what it named. Each retired name becomes
   its successor, `MANAGER` and `FRONT_OF_HOUSE` are dropped, `PRIVILEGED_ROLES` keeps its whole
   floor, and each rewrite is audited as `config.changed` with no actor.

**Why one change is safe.** Workers Builds deploys the code and `migrate.yml` applies the
migration, with nothing sequencing the two, and `liveGrants` ignores a role `ROLES` no longer
lists (0090). A grant is stranded between the deploy and the migration only if its holder would
lose access, which is exactly what the guard refuses. Production's grants were read before merging
(29 September 2026): the retiring grants are one `BAR_MANAGER` beside the holder's `FOH_MANAGER`,
and one `BAR_MANAGER` and one `TRAINING_MANAGER` beside permanent `ADMIN` grants, so the guard
passes and nobody loses anything in the window. The guard's query is run read-only again just
before merging.

**Acting cover** (4.1.5, 4.2.5, 7.8.2, 7.8.3) is a dated grant of the post's role, with the clause
in the note.

## Consequences

- The `PRIVILEGED_ROLES` floor is every post role and `ADMIN`: `ADMIN`, `PRESIDENT`, `SECRETARY`,
  `TREASURER`, `FOH_MANAGER`, `THEATRE_MANAGER`. `COMMITTEE` stays aggregate-only and unprivileged;
  post roles carry the Committee's standing, and `COMMITTEE` never carries theirs.
- `RETIRED_ROLE_WORDING` names every retired role, so audit rows written before this still read.
- J-103 becomes the President's story, amending 0028. D-127 criterion 2 names the Secretary and
  Welfare Officer. The President is the one reviewer of the IT Managers' grants and settings
  changes who cannot make them.
- At full strength twenty-two people hold twenty-three grants; only the Archivist holds two
  (`COMMITTEE` for the post, `ADMIN` for the function). The operations handover checklist lists the
  grant each post receives on 1 August.
- The import's `proscenium:MANAGER` and `ticketing:MANAGER` lose their suggestion, and each such
  grant is decided by hand (0070). A recorded import decision naming a retired role becomes an
  exception and is reviewed again, as under 0090.
- The personas follow: `dev-president`, `dev-secretary` and `dev-committee` join; `dev-manager`,
  `dev-access`, `dev-bar` and `dev-training` go.
- Three separations stand. The Front of House Manager takes the money and the Treasurer keeps the
  record (4.3 against 4.4, 7.2): a unit test pins that no role holding `ticketing.write`,
  `bar.write` or `night.till` holds `finance.write`, except `ADMIN` (0113). Access verification
  stays away from the box office (D-127 criterion 2, 0050). Approving a comp on any day and
  narrowing a pass with live passes stay the IT Manager's (D-117 criterion 1, D-123 criterion 4).
- The next posts to earn a role of their own are the External Relations Manager when external hires
  land (C-301), the Marketing Coordinators with campaigns (H-201 to H-203), and the Costume, Props
  and Make-Up Manager and the Technical Manager with the asset register (C-201).

## Options considered

- **A role for every post.** Thirteen posts have nothing to hold yet: their features are V2 or
  Later, or their authority comes from department leads (0037) and shifts (5.1).
- **Fold `THEATRE_MANAGER` into `MANAGER`**, as the #1211 audit proposed. `THEATRE_MANAGER` was a
  strict subset, but the Theatre Manager is an elected post and `MANAGER` is not.
- **Keep a `COMMITTEE` grant beside each post role.** Two grants per post, kept in step by habit,
  which is what 0090 set out to end.
- **Land the migration and the vocabulary in two pull requests**, as the audit proposed. Safe
  either way, but it leaves retired names grantable for weeks; the guard and the production read
  make one change as safe.
