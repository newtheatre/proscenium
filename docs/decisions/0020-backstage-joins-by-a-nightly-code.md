# ADR-0020: Backstage joins by a nightly code, not an account

**Status:** Accepted · **Date:** 2026-08-21 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The backstage comms board ([11-show-night-screen-design §5](../11-show-night-screen-design.md)) runs
on a resident device: a tablet in the wings or the tech desk Mac. Its users are the stage manager,
the DSM and operators, who change every production, are staffed by the production rather than by the
front-of-house rota, and by design hold no Proscenium accounts.

Every account-shaped answer fails on the same point. A per-person grant needs the accounts this
group does not have. A dedicated device account — which was the first version of this decision — is
a standing credential somebody must own, rotate at handover, and keep signed in on a shared machine.
The failure mode of a device account is a resident display signed out at the worst possible moment,
with nobody in the building knowing the password.

What is actually being protected is unusual, and it is what makes the answer unusual. The page holds
no personal data, no money and no booking data (§5.2). The threat is **message integrity**: a
spoofed "cleared for house open" or a prank "hold" is an operational problem, not a data breach.

## Decision

**Authentication is a per-performance-day code, and nothing else.** No accounts, no device account,
no roles. Six digits, generated automatically with the day's first performance, shown only inside
the FOH screen's Backstage view, handed from the duty manager to the stage manager at the half. That
handover is the authentication.

The security model is five controls, in order of how much work they do:

1. **Rotation.** A new code every performance day. Yesterday's devices, yesterday's screenshots and
   yesterday's QR join links are all dead. Nothing accumulates, which is the failure of every
   standing shared secret.
2. **Rate-limited joining**, per device and IP, with backoff. Past a threshold of failures across
   all devices the code regenerates itself and the FOH screen says so, so even a distributed guesser
   achieves a code reset rather than a join.
3. **A visible device list** — name given at join, join time, last seen. The duty manager counting
   "desk and Sam, so why is there a third?" is the detection mechanism, and it needs no technology
   beyond rendering the list. This is what makes a shared code honest.
4. **A kill switch.** One tap bumps the performance's session epoch: every device is out, a new code
   appears, a line lands in the incident log and `boxoffice@` is notified. Audited, and therefore
   free to use liberally.
5. **Least ability, server-side.** A code session can do three things and read four, for today only,
   enforced against the session type rather than by the UI. The worst a hostile join achieves is a
   false message, which controls 3 and 4 exist to catch.

Codes are stored hashed, like any credential. All code sessions die when the night is closed or at
02:00, whichever is first.

**Emergency information is never behind the code.** `/backstage` before joining shows the code
prompt and the emergency content, and nothing else.

## Alternatives considered

- **A dedicated device account** (the first version of this decision). A standing credential to
  manage and hand over, and a signed-out resident device is precisely the failure this design cannot
  tolerate.
- **A standing code**, not rotated. Becomes graffiti in the tech box within a term.
- **Per-run personal grants** to crew accounts. Requires the accounts whose absence is the whole
  problem.

## Consequences

- **Attribution is social, not authenticated.** The name typed at join rides on every message. That
  is good enough for "who called standby", which is all it is asked to answer. A production abusing
  the free-text channel is a conversation with the production, not a feature request.
- The code-session type must be genuinely separate from a user session, because
  [ADR-0022](0022-access-needs-are-special-category-data.md) depends on it having no path to access
  data at all. "Has no path" is stronger than "is not granted", and it is the property to preserve.
- Closing the night is now a security action as well as a bookkeeping one
  ([12-access-and-staffing §4.1](../12-access-and-staffing-design.md)).
