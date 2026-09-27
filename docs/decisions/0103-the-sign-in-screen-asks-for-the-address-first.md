# 0103: The sign-in screen asks for the address first, and the emailed link is the way back

- Status: Accepted (IT Manager, 26 September 2026)
- Date: 2026-09-26
- Supersedes in part: 0026 (the standing "I did not get my confirmation email" step on the
  sign-in screen)

## Context

The sign-in screen led with **Sign in with Google**, which only `@newtheatre.org.uk` accounts can
use, above an address and a password. The emailed sign-in link sat three taps deep under "I have
forgotten my password", and 0026 added a standing "I did not get my confirmation email" step
beside them: nine controls at 32 pixels on a 500 pixel phone. No emailed link carried `next`, so
confirming an address, resetting a password and claiming a guest account each ended on the
sign-in screen and then on the home page, and a guest claiming their bookings typed a password
three times: to register, to choose it, and to sign in.

The resend step duplicates the link. A sign-in link proves the mailbox, so consuming it confirms
the address (A-102 criterion 4, A-107 criterion 3), and it is sent to an account whose address is
not confirmed yet. 0026 needed a way back that did not depend on the missing message; the link
already was one.

## Decision

**The screen asks for the address first.** What it offers next depends on the address, and is
settled when the field is left or the form is sent, never on each keystroke, so a theatre address
does not flicker through a password field on its way:

- A theatre address is offered **Continue with Google** alone. No password field is drawn for
  it, so 0008's rule is met at the first step as well as at every write.
- Any other address is offered **Email me a sign-in link** first, with the password beside it and
  **I have forgotten my password** under that.
- Passkeys are offered among the address field's suggestions once it is focused, and by **Use a
  passkey**. Every control is at least 44 pixels tall.

**The standing resend step goes.** A refused password keeps one wording for every failure
(A-103 criterion 1) and points to the sign-in link, which needs no password and confirms the
address as it signs in. The confirmation screen's expired state offers the sign-in link too.

**Every emailed link carries `next`.** The sign-in link, the reset link, the claim link, the
confirmation link and the "you already have an account" message carry the path the person set
out from, and only a path on this site travels (`localPath`, as for the screen itself). An
explicit `next` wins over the landing on Tonight (0094).

**Choosing a password signs in.** A reset or claim link, once the password is set, ends every
other session on the account (A-108 criterion 4) and signs this browser in. A confirmed second
factor is still asked for first, as it is after a sign-in link (A-107 criterion 4).

**The confirmation link signs in only in the browser that registered.** Registering seals the
address typed into a cookie that lasts as long as the confirmation link. Opened in that browser,
the link confirms the address and signs in; opened anywhere else, it confirms only and offers
**Sign in**. The cookie is set whatever the address, so it tells a caller nothing (A-101
criterion 2), and the first confirmation spends it. A link for a changed address (A-115), or an
account with a confirmed second factor, confirms without signing in.

## Consequences

- A-103 criterion 1 is amended: the way back for an unconfirmed address is the sign-in link, not
  a standing resend step.
- `POST /api/auth/verify/resend` stays, enumeration-safe and rate limited (A-102 criterion 3),
  though no screen calls it now.
- A reset, a claim and a confirmation in the registering browser now start sessions. Each is
  recorded as `session.started.magic-link`, since the mailbox is what proved it, and none
  satisfies a second factor on its own.
- A browser suite that signs in by filling the address, then the password, then pressing the
  form's submit button still works: the password field appears once the address field is left,
  and its form holds the only submit button on the screen at that point.
- Passkey suggestions start when the address field takes focus rather than on load, so a visit
  that never reaches for the field asks the server for no challenge. A browser that lists
  passkeys only for a request already waiting when the field is focused still has **Use a
  passkey**.

## Options considered

- **Keep both steps, with the sign-in link as the primary button under the form.** Still leads
  with a password most members never set, and keeps Google in front of the public.
- **A "Trouble signing in?" link under the current layout.** Leaves the sign-in link a step deep
  and the controls as they were.
- **Google first, as now.** The public cannot use it, and they are most of the people signing in.
- **Two tabs, "Theatre account" and "Everyone else".** Asks the visitor to classify themselves
  before typing anything, when the address already says which they are.
