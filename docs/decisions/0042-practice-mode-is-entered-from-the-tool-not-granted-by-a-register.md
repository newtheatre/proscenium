# 0042: Practice mode is entered from the tool, not granted by a register

- Status: Accepted
- Date: 2026-09-02

## Context

G-126 built practice targets and practice windows. A target mapped one or more modules to a
practice surface key with a window length; opening a session's register opened one time-boxed
window per placed member per matching target, race-safe against duplicates; the nightly sweep
closed lapsed windows and did nothing else. It was carefully built, and the duplicate-window bug
the old estate had was made impossible rather than unlikely.

It has never had a reader. The gate that would have enforced it, `practiceOpenFor`, was exported
with no call site anywhere in the repository. There is no member-facing practice surface, no way to
see one's own windows, and no sandbox: G-206, the story that would have consumed all of this, is
V2 and unbuilt. So the feature was three tables, two route groups and a nightly sweep step writing
and expiring rows that nothing ever asked about.

The deeper problem is where it put the decision. A window was granted to a member by somebody else
finishing an administrative act, at a moment chosen by that act, for a length set on a target
configured months earlier. A member who wanted to rehearse the till at 3pm on a Tuesday, a fortnight
after their session, could not; a member who never wanted to rehearse got a window anyway. The
person who knows whether they want to practise is the member, and the moment they know it is the
moment they are looking at the tool.

## Decision

**Practice targets and practice windows are withdrawn.** The three tables are dropped, both route
groups and the console screen are deleted, opening a register no longer opens anything, and the
expiry sweep loses its closing step. G-126 is resolved as withdrawn, and the per-target window
length leaves the workshop register with it.

**Practice mode is entered self-serve, from the screen of the thing being practised.** A member who
holds the module that qualifies them for a tool enters practice mode on that tool's own screen,
when they want to. Eligibility derives from the record held, the way every other operational
authority in this system derives from a fact rather than a standing grant (0009). There is no
window to open, nothing to hand out, and nothing to close on a timer.

This is V2 (G-211), and G-206's sandboxes depend on it rather than on the withdrawn G-126.

## Consequences

- Nothing is lost in the field: no window was ever read, so no member's access changes.
- Open question 3 in the training backlog, who may close a practice window, is moot. It was
  answered on 2 September and the answer is withdrawn with the feature.
- G-115's criteria drop their practice clauses. Criterion 4's race, two devices opening one
  register, keeps its named regression test, now standing on the conditional write alone rather
  than on the partial unique index that the window claim provided.
- The eligibility rule for V2 is a real design question this record does not settle: whether
  holding the module is enough, or whether a lapsed record still qualifies somebody to rehearse.
  G-211 carries it.
- Nothing about the till, door scan or Challenge 25 sandboxes themselves changes. They were always
  V2 and they remain so; only the way somebody reaches them does.
