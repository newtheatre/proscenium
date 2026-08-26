# Module B: Programming and productions (deferred)

This module is deferred by decision, not by doubt (Get-In constraint 2): external tools handle
production management today, they work, and they remain first-class citizens until the
operational core has earned a year of trust. These stubs record the agreed destination at epic
level, to be decomposed with the 2027/28 committee in summer 2027; their job now is to make sure
no MVP data-model choice quietly closes a door this module will need open. Each stub therefore
carries a note of what MVP must not preclude.

Stories: 8. Phases: 0 MVP, 0 V2, 8 Later.

## Open questions

- Which external production-management tools are in use today, per production, and what link
  fields MVP show records should carry to them in the meantime.
- Retention for programming data: unsuccessful proposals and audition outcomes are personal
  data, and this module must decide how long they live before it ships.
- Whether the public archive imports the theatre's pre-existing history data or begins at the
  first production settled on the new system.
- How conflict-of-interest declarations interact with the audit trail: reviewers' private scores
  must stay private while the programming decision itself stays accountable.

## B-301: Season proposal windows and structured submissions

- Role: Member
- Phase: Later
- Story: As a member, I want to propose a show through a structured submission inside a season's
  proposal window so that programming runs on comparable submissions, not emailed documents.
- Depends on: none
- Acceptance criteria:
  1. Proposal windows are configured per season with open and close dates; submissions capture
     title, synopsis, team, rights status, indicative budget, technical demands and preferred
     slot type.
  2. Drafts are private to the proposing team until submitted; submissions are immutable after
     the deadline except by an audited committee unlock.
  3. Proposers can see their proposal's status throughout and receive the decision with
     feedback.
- MVP must not preclude: seasons exist as a first-class entity from MVP (a row shows reference,
  not a free-text label), so proposal windows can attach to a season later without a data
  rework.
- Source: Prompt Book B-1; audit: no predecessor in the estate; Get-In constraint 2, part 4
  (Phase 5)

## B-302: Committee review with conflict-of-interest handling

- Role: Officer roles
- Phase: Later
- Story: As the committee, I want to review proposals with declared conflicts locked out so that
  programming decisions are both informed and defensible.
- Depends on: B-301
- Acceptance criteria:
  1. Reviewers score and comment privately per proposal; scores are never visible to proposers,
     and each reviewer's scores are private to them until the review closes.
  2. A reviewer on a proposing team declares the conflict and is locked out of that proposal's
     review; the declaration and the lockout are both recorded.
  3. The programming decision is recorded with its rationale, and feedback returns to proposers
     through the system rather than by side channel.
- MVP must not preclude: per-record access. The MVP permission model must be able to scope
  visibility to a single record, not only to module-wide roles; casting (B-305) and access
  profiles already need the same property.
- Source: Prompt Book B-2; audit: no predecessor in the estate; Get-In constraint 2

## B-303: Programming a season creates productions and budget allocations

- Role: Theatre Manager
- Phase: Later
- Story: As the Theatre Manager, I want programming a proposal to create the production, its
  performance skeleton and its budget allocation in one step so that the programme, the calendar
  and the ledger all descend from one decision.
- Depends on: B-301, B-302
- Acceptance criteria:
  1. Accepting a proposal creates the production with slot dates, venue and performance
     skeleton, and posts its budget allocation in the finance module, atomically; nothing
     half-creates.
  2. Publishing a season pushes its shows to the public site as coming soon before any ticket
     exists; nothing goes on sale until rights are cleared (B-306).
  3. Declined proposals close with feedback and remain queryable for the season's records.
- MVP must not preclude: shows carry an optional production reference from MVP (a nullable
  foreign key, unused until this module ships), and ledger entries accept an optional production
  dimension, so allocations and spend can attach later without a ledger migration.
- Source: Prompt Book B-2; audit: no predecessor in the estate; Get-In constraint 2, part 2
  (data model kept in mind now so nothing blocks it)

## B-304: Production hubs with teams and milestone checklists

- Role: Production role
- Phase: Later
- Story: As a director or producer, I want a production hub with my team and a milestone
  checklist so that a show's people, schedule and obligations live in one place a successor
  could pick up.
- Depends on: B-303
- Acceptance criteria:
  1. A team roster with production-scoped roles (who may edit the show page, who may spend
     budget, who is the licensed keyholder); membership is required for participation, and the
     roles end at settlement.
  2. Milestone checklists seed from a committee template (rights, risk assessment, poster,
     programme copy, tech rehearsal, press night) with owners and due dates; overdue items
     surface on the committee dashboard.
  3. Room bookings and budget lines link back to the production, so its true cost and room usage
     are queryable.
- MVP must not preclude: the MVP role model supports scoped, expiring, non-committee grants
  (production-scoped roles are the same derived-authority pattern as shift authority), and room
  bookings carry an optional production reference from MVP so usage can be attributed later.
- Source: Prompt Book B-3, P3; audit: no predecessor in the estate; Get-In constraint 2

## B-305: Audition scheduling and private casting outcomes

- Role: Production role
- Phase: Later
- Story: As a director, I want to publish audition slots that members self-book and to record
  casting outcomes privately so that casting is announced by decision, never by data visibility.
- Depends on: B-304
- Acceptance criteria:
  1. Audition slots publish per production; members self-book, race-safe like every other slot
     claim in the system.
  2. Panels record outcomes privately; nothing about an outcome is visible to candidates until
     an explicit announce action, and the announcement is the only disclosure path.
  3. Audition data for unsuccessful candidates falls under a stated retention rule rather than
     being kept indefinitely.
- MVP must not preclude: the slot-booking machinery built for rooms and training sessions stays
  generic enough to host audition slots; nothing hard-codes the owner of a bookable slot to a
  room or a training module. Private outcomes also rely on the per-record access noted at B-302.
- Source: Prompt Book B-3; audit: no predecessor in the estate; Get-In constraint 2

## B-306: Rights and licensing tracking gating on-sale

- Role: Theatre Manager
- Phase: Later
- Story: As the Theatre Manager, I want rights tracked per production and gating on-sale so that
  we never sell tickets to a show we may not perform.
- Depends on: B-303
- Acceptance criteria:
  1. Each production carries a rights record: rightsholder, application date, licence status,
     fees linked to finance, and restrictions (no filming, mandatory credits, cast limits).
  2. Tickets cannot go on sale while rights are unconfirmed; the override is a named, audited
     committee action.
  3. Restrictions surface where they bite: no-filming on the show-night pack, mandatory credits
     on the programme template.
- MVP must not preclude: going on sale must be a single guarded transition in MVP (one code path
  already asserting publish state and capacity), so a rights predicate is one more check rather
  than a redesign; the show-night pack supports per-show flags from MVP.
- Source: Prompt Book B-4; audit: no predecessor in the estate; Get-In constraint 2

## B-307: Production settlement feeding the archive

- Role: Treasurer
- Phase: Later
- Story: As the treasurer, I want a settlement at close-of-run compiling revenue, costs, comps
  and contribution into a frozen report so that the season's accounts and the archive both
  descend from one closing act.
- Depends on: B-303, B-304
- Acceptance criteria:
  1. Settlement compiles box-office revenue, costs, comps and contribution against the budget
     allocation into a frozen, dated report.
  2. Settlement ends the production's scoped roles and closes its ledger lines; later
     corrections are new entries in the open period, never edits to the settled report.
  3. The settled report feeds the season accounts and triggers the archive entry (B-308).
- MVP must not preclude: the ledger's period-close discipline ships in MVP, and every ledger
  entry carries source and references from day one, so a per-production roll-up is a query, not
  an excavation.
- Source: Prompt Book B-5, I-2; audit: no predecessor in the estate; Get-In constraint 2

## B-308: The public archive with consented credits

- Role: Visitor
- Phase: Later
- Story: As an alumna, I want every production frozen into a public archive with credits as
  people consented so that the theatre's hundred-year history keeps accumulating by default.
- Depends on: B-307
- Acceptance criteria:
  1. On settlement, the production's public record (consented credits, poster, dates, venue)
     freezes into the archive automatically.
  2. Each person controls their credit name per production, and a later erasure updates the
     archive entry.
  3. The archive exports in an open format, so the record outlives this system too.
- MVP must not preclude: the MVP profile carries credit-name control designed to become
  per-production (the Prompt Book places this in A-3, which is MVP), and archive rows reference
  people by id rather than by copied name alone, so erasure and renames can always reach them.
- Source: Prompt Book B-5, A-3; audit: no predecessor in the estate; Get-In constraint 2, part 4
  (Phase 5)
