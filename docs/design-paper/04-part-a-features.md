# Part A: Features

The platform is a small always-on core plus modules a theatre switches on, with the production at the centre of the model. Nothing in this part names a technology. The sub-tabs hold the account model, the module catalogue with its priorities, the form builder, and the features that go beyond today's Proscenium.

## Who it serves

| Person | What they need |
| --- | --- |
| Audience member | Find a show, book or buy, get a ticket, hear about changes |
| Member or volunteer | Join, sign up for shifts and shows, train, book rooms, see their own record |
| Production team | Run a show from proposal to closing night: people, schedule, budget, kit |
| Front-of-house and bar staff | Work tonight from a phone: door, till, checklists, incidents |
| Officers or staff | Approve, configure, report, hand over to a successor |
| Visiting company or hirer | Run their own show in someone else's venue, seeing only their own records |
| Site owner | Install, brand, switch modules on, update, back up |

These are postures, not fixed roles. A theatre defines its own role names and maps permissions to them. The platform ships presets for a student society, an amateur company and a small professional venue.

## The core, always on

### Organisation

- Name, branding, locale, time zone and currency.
- The hour the operating day rolls over, so a show that ends after midnight belongs to the night it started.
- The year and season pattern: a committee year, a financial year, named seasons, or none.

### People and accounts

- One account per person across every module, with clearly separate audience and members' experiences (see the Accounts sub-tab).
- Guest checkout, with an unclaimed account the buyer can claim later.
- Unclaimed accounts for people recorded before they ever sign in, such as a trainee on a paper register.
- Merging duplicate accounts, and erasure that anonymises while keeping history.
- Emergency contacts and access needs, held as protected data.

### Roles and permissions

- Roles a theatre names itself, with optional expiry at a date the theatre sets.
- Permissions scoped to the whole site, one module, or one record such as a single production.
- Authority that derives from facts: tonight's confirmed shift, a current training record, a place on a production team.
- Nobody grants themselves a role, and self-dealing (approving your own refund) is refused where the write happens.

### Seasons, productions and performances

- A season groups productions. A production has performances. Every other module hangs its records off one of these.
- A production can be the theatre's own, a visiting company's, a hire, or a non-show event such as a workshop or a social.
- A performance has a venue, a space, a capacity and a state (draft, scheduled, cancelled, completed). Whether it is on sale is not core's to say: the box office holds the sale state, so a theatre that sells elsewhere has no switch that does nothing.

### Venues and spaces

- One or many venues, each with spaces.
- A venue the theatre does not manage (a union room, a hired hall) is a first-class case with requests, not bookings.
- Closures and public holidays.

### Settings and policy

- Every operational number is a setting with a default and an audit trail.
- Public pages quote settings live, so a policy page never disagrees with what the system enforces.

### Audit

- Who did what and when, with no personal free text in the detail.
- A manual entry for things done outside the system.

### Notifications

- One centre for email, in-app inbox and push.
- Per-person preferences, digests, retries, a send log and versioned templates.
- Sender identity per area of the theatre (box office, technical, welfare).

### Files

- Posters, documents and images with access rules tied to the record they belong to.

## How a theatre makes it its own

Flexibility comes in four layers, from least to most effort:

1. **Settings.** Numbers, deadlines, names and toggles, changed in the app.
2. **Modules.** Switched on or off in the app, with a guided setup for each.
3. **Custom fields and vocabularies.** Through the form builder, a theatre adds its own fields to productions, people and venues, and its own lists such as department names, ticket concessions or incident types.
4. **Content and design.** Public pages written or redesigned in the fork.

A theatre should never need to edit application code to match its own practice. A request that needs code is a signal that a setting or an extension point is missing.

## Feature rules that apply to every module

- A feature is not done until it has a screen, documentation and a way to undo a mistake.
- Every money-taking screen states its expected total, and a mismatch is refused with both figures shown.
- Every list can be filtered, exported and linked to.
- Every gate tells the person why they were refused and what would let them through.
- Anything a person can do for themselves, staff can do on their behalf, and it is recorded as such.
