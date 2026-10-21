# 0121: A link says what is wrong with it on arrival

- Status: Proposed
- Date: 2026-10-14
- Amends: K-133 (the error page's 404 words) and A-102 criterion 3 (the reset page)

## Context

The hands-on review of 13 October 2026 found three ways a bad link let its reader down.

- **The error page drowned the page's own words.** A garbled waiting-list token, an unknown
  `/book/<id>`, `/help/<page>` or `/policies/<page>` each throws a 404 carrying a specific sentence
  built by `saysNoSuch` ("That performance is no longer here. Go back to what is on and choose
  another."). `app/error.vue` showed "There is nothing here" for every 404 regardless. `/qr/<bad>`,
  which redirects to a page that says the link is not valid and offers a resend, was the one that
  read well.
- **`/reset` checked its link last.** `/verify` and `/magic` spend their token on arrival and say
  at once when it is dead. `/reset` cannot spend its token until the password is chosen, so a
  reader typed a fifteen-character password before learning the link was used.
- **`/verify?token=garbage` showed a validator's words** ("That is too short"), and a link already
  used said "That link has expired".

## Decision

- **A 404 whose message is a `saysNoSuch` sentence shows that sentence.** `isNoSuchMessage` in
  `shared/utils/no-such.ts` recognises the shape; the router's own "Page not found: /x" is not one,
  so an unknown address keeps the house words.
- **`/reset` asks before it shows the form.** `GET /api/auth/password/check?token=&kind=` answers
  `{ usable }` from the token's hash and kind, spending nothing (`tokenUsable` in
  `server/utils/tokens.ts`). A dead link shows the ask-again step straight away. A failed check
  falls back to showing the form, since the reset itself still refuses a dead token.
- **Every token route words a malformed token in house copy**: "That link is incomplete. Ask for a
  new one." on `/api/auth/verify` and `/api/auth/magic-link/consume`.
- **A dead confirmation link is "That link no longer works"**, says that an address already
  confirmed only needs a sign-in, and offers Sign in beside the fresh link. Claiming spends the
  token, so a used link and an expired one cannot be told apart from the token alone.

## Consequences

- The check endpoint answers only whether a secret the asker already holds is still live. It names
  no account and changes nothing, so it proves no more than the link itself.
- A reset link opened twice in quick succession shows the form both times; the first password set
  wins, exactly as before.

## Options considered

- **Spend the reset token on arrival and carry a session-scoped claim to the form.** Rejected: a
  reader who closes the tab loses the link, and a prefetching mail scanner would spend it.
- **Keep a used-token register to say "already used" rather than "no longer works".** Rejected for
  now: it keeps a row per spent token for a sentence the sign-in button already answers.
