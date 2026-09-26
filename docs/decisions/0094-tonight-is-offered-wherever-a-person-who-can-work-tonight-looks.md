# 0094: Tonight is offered wherever a person who can work tonight looks

- Status: Proposed
- Date: 2026-09-26
- Amends: 0040

## Context

0040 put Tonight in the account menu, gated on `onShiftTonight`, and said the one function behind
it would change when the rota landed. By the MVP flow review of 25 September 2026 (issue 1305)
three screens answered "on shift tonight" three ways. The account menu counted a confirmed
performance shift anywhere in the night, ignoring bar openings (0077) and the shift's own window
(0078), so it offered Tonight to somebody the screens would then refuse. /my counted a claim still
waiting for an officer, said the role as `DUTY_MANAGER`, and dropped tonight's shift at its
curtain. My rota showed the curtain time, dropped the shift at 19:30, and offered a Release the
server refuses once the show night has begun. Officers holding a night permission (0044) had no
way in at all: the Bar Manager typed `/tonight/till`. Sign-in landed everybody on the public home.

A volunteer arriving at the theatre looks at whichever screen is already open. If each screen has
its own idea of whether they are on shift, the one they happen to look at decides whether they
find the door screen.

## Decision

**One fact, derived where the guard derives it.** `onShiftTonight` is true while the viewer holds
a confirmed shift on one of tonight's performances or on tonight's bar opening, and the moment
sits inside that shift's own window widened by `SHIFT_AUTHORITY_GRACE_MINUTES`: the window and
the grace `requireNightAuthority` reads (0078). A claim never counts; a disabled or erased account
never counts. `canWorkTonight` is that fact, or holding any of the three night permissions
`night.door`, `night.till` and `night.manage` (0044). The session carries both, so the member
shell, /my and the hub read the same answer.

**The chrome offers what the fact allows, and still never enforces.** Tonight is the account
menu's first entry for whoever can work tonight. Somebody on shift also sees a 48px on-shift bar
on public and member pages, linking to Tonight; an officer holding only a permission sees the
menu entry and no bar, because they are not on shift. Every route still guards itself (E-111
criterion 5), and a stale screen that offers Tonight is answered by the guard, not by the chrome.

**Sign-in lands on Tonight inside the window, and an explicit `next` always wins.** With no
`next`, somebody on shift arrives at `/tonight` rather than the public home. A `next` that is a
path on this site is followed whatever it is, the home page included.

**Tonight's shift stays on My rota until 04:00, with its window.** My rota and /my keep a shift
through its show night rather than dropping it at curtain, show its window rather than its
curtain, name the role in words, and read a claim as "Claimed, waiting to be confirmed". Once the
show night has begun, My rota offers the shift's own screen and tonight's confirmed duty manager in
place of Release, since the server refuses a release from then (E-107 criterion 1).

## Consequences

- The account menu stops offering Tonight to somebody whose shift is hours away or over, and
  starts offering it to a bar-opening shift and to the three officers. The hub itself is unchanged:
  it still asks the guard which tiles to show (0098).
- `onShiftTonight` costs two small reads per session request, the shift windows and the opening
  windows, each bound to a fixed handful of parameters (0006).
- A shift stamped before shifts carried a window has none, and is on shift all night, as the guard
  already treats it (0078, E-131 criterion 4).
- The copy-style glossary gains "On shift": confirmed and inside the window. "Claimed" means
  waiting for an officer and opens nothing.
- Web push and a redirect from /my to /tonight were left out: the first is V2, and the second
  would take somebody away from a page they chose.

## Options considered

- **Keep three checks and fix each.** Rejected: that is how they drifted apart. One derived fact
  read by the session is the only way the menu, /my and the hub cannot disagree.
- **Count a claimed shift.** Rejected: a claim is not authority (0009, 0044), so a link it offers
  is a link the guard refuses.
- **Show the on-shift bar to officers too.** Rejected: an officer is not on shift, and a bar that
  says so would be the chrome contradicting the night report.
