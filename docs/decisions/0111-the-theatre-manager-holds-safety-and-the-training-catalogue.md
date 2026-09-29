# 0111: The Theatre Manager holds safety and the training catalogue

- Status: Accepted (IT Manager, 29 September 2026)
- Date: 2026-09-29
- Amends: 0037 (who holds `training.write` and `training.leads`) and 0091 (who records training by
  address)

## Context

Two roles with no post held standing work the constitution gives to one. `SAFETY_OFFICER` followed
incidents up and closed the open-items list (E-116); `TRAINING_MANAGER` owned the catalogue,
appointed department leads, revoked records and recorded training by address (G-107, G-110, G-122,
0091). Neither had been granted to the post it served: on 26 September 2026 nobody held
`SAFETY_OFFICER`, and the one `TRAINING_MANAGER` grant was an IT Manager's.

The Theatre Manager is responsible for "Liaising with the relevant UoNSU Health & Safety staff",
risk assessments, and first aid and fire training (4.11.6), which answers module E's open question
3. No post owns training as a whole: it is spread across a dozen clauses, which 0037's department
leads already express. What remains needs one owner: the catalogue, appointing leads, revoking
records and recording by address. The constitution's nearest is the Theatre Manager, who chairs
the Backstage Subcommittee whose members lead most departments (4.11.1, 6.5) and makes the Health
and Safety documentation, the Training Policy among it, with the President (9.5, 9.6).

## Decision

**`THEATRE_MANAGER` holds safety and the training catalogue.** It holds `safety.read`,
`safety.write`, `training.read`, `training.write`, `training.leads`, `training.revoke`,
`training.by-address`, and the emergency card (`emergency-card.read`, `emergency-card.write`),
which it shares with the Front of House Manager because fire training (4.11.6) and the FoH speech
(4.4.2) both rest on it. It keeps the rooms (4.11.4), `accounts.read`, `members.read` and
`config.read`. `SAFETY_OFFICER` and `TRAINING_MANAGER` leave `ROLES`, and their grants fold into the
holder's `THEATRE_MANAGER` grant or, for an IT Manager, into `ADMIN` (0112, migration 0130).

**`training.override` stays the IT Manager's** break-glass (G-120 criterion 5).

**What reads the map follows it.** Incident routing already reads `safety.write` from the map;
the training expiry digest now reads the roles holding `training.revoke` instead of a hard-coded
`['ADMIN', 'TRAINING_MANAGER']`.

**The Theatre Manager gives up the audit trail and the fellowship roll.** `audit.*` moves to the
President (4.1.2, 0112); the roll is the Archivist's (3.7.3) through `ADMIN`, read by the Secretary
who runs the fellowship meeting (3.7.1).

## Consequences

- 0037's "the training officer and the general manager" for `training.write` becomes the Theatre
  Manager and the IT Manager. Module G's questions 7 and 8 moved `training.leads` and
  `training.revoke` to the Training Manager without amending 0037; both are now the Theatre
  Manager's and the IT Manager's, recorded here.
- 0091's `training.by-address` is the Theatre Manager's; a lead of the module's department still
  derives the same for their own department.
- The Theatre Manager follows incidents up and closes them; the Front of House Manager runs the
  nights on which most are logged. Keeping the two posts apart keeps the night's own officer from
  closing the night's own incidents.
- The `training:ADMIN` import suggestion moves to `THEATRE_MANAGER`, where `rooms:ADMIN` already
  lands; both are still decided per grant (0070).
- Copy naming the Training Manager or the Safety Officer names the Theatre Manager.

## Options considered

- **Keep `TRAINING_MANAGER` as a delegate role.** It has no post, so the next committee would guess
  whom to give it to at handover.
- **Give training to `ADMIN`.** It widens a system function further, and the catalogue is
  committee business, not IT.
- **Give safety to the President.** 4.1.1 shares keeping the Theatre safe, but 4.11.6 names the
  Theatre Manager's work; the President reads the open items (0112) and closes none.
