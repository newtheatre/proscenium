# 0243: A training screen says what it will do before it does it

- Status: Proposed
- Date: 2026-10-22
- Amends: G-110 (departments), G-112 criterion 1 (scheduling), G-115 criterion 7 (changing the modules), G-118 (logging)

## Context

The hands-on map of 21 October 2026 found training screens that hid what they were about to do,
or said it in a way that misled.

- A department lead was shown **Add a department**, **Assign a lead**, **Edit** and the crosses,
  each of which the server refused. Lead assignments showed no end date, and a renewal said only
  "Lead assigned".
- The denial page said a catalogue screen "is for the Theatre Manager", though leads use it.
- Typing today's date into a new session left the dialog open with no message. Places above 60
  were silently clamped to 60.
- The sign-up warning "this usually follows TECH-101" appeared on a session that teaches TECH-101.
  A member who already held a module was not told so.
- **Change the modules** named the members who now lack a prerequisite, but nobody told them.
- A superseded record showed two states at once, expiry dates dropped their year, and the log
  dialog printed ISO dates, said "1 record already exist", and counted records it could not create.
- A trainer's console home was empty, though they had registers to take.

## Decision

1. **A screen offers only what its reader may do.** Department management is its own ability,
   `manageTrainingDepartments` (`training.write`), so a lead sees the list without the buttons.
2. **A refusal names everyone a screen is for.** `standingsThatReach` asks the same ability as
   a lead and as a trainer, and the denial page names them beside the roles.
3. **A value the form cannot take is refused in words, never adjusted.** Today's date shows the
   scheduling rule and offers **Log a session**. Too many places shows the limit.
4. **Gaps are judged against the session.** A prerequisite the same session teaches is not
   warned about, at sign-up, on the schedule or for a walk-in. A safety-critical gap still blocks,
   because the register awards both modules at once and cannot order them.
5. **Telling the people a module change affects is offered, ticked, on the save.** The server
   reads who lacks what again as it saves, and emails `training.session.needs-first` only if the
   change landed.
6. **Dates that can be far off carry their year**, and a superseded record names the award that
   replaced it.
7. **The console home lists the trainer's registers to take**, from the same read as My training.

## Consequences

- An ability that a lead or trainer reaches by standing must be one `can()` can answer with no
  permissions, or the denial page will not name them.
- The planner's calendar still starts tomorrow, but its typed field takes any day, so that the
  form can refuse today in words. `DateField` gained `calendarMin` for this.
