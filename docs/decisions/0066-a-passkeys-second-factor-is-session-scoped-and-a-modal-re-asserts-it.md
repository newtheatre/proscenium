# 0066: A passkey's second factor is session-scoped, and a modal re-asserts identity rather than forcing full re-entry

- Status: Accepted
- Date: 2026-09-10

## Context

Before A-128, the session carried `signedInAt` and nothing about how it was proved (`server/utils/
session.ts`). A passkey sign-in (`server/api/auth/passkey/authenticate.post.ts`) is genuinely two
factors in one gesture, something you have unlocked by something you are or know, but nothing
anywhere read that fact back out again. Ten routes instead forced a full sign-out and sign-in to
raise assurance, gated by `requireFreshSession` (`server/utils/mfa.ts`), a fixed ten-minute
constant with no configuration behind it: `server/api/account/mfa/enrol.post.ts`,
`mfa/confirm.post.ts`, `mfa/recovery-codes.post.ts`, `mfa/index.delete.ts`,
`server/api/account/password.put.ts`, `email.put.ts`, `close.post.ts`, `methods/[id].delete.ts`,
`server/api/auth/passkey/register.post.ts`, and `server/api/admin/audit/index.post.ts`. Of those,
only `app/pages/account/security.vue` actually wired the resulting 401 into a "sign in again" link;
`SignInMethods.vue` and `admin/audit.vue` left the same refusal as an unactionable toast. Worse,
`account/close.post.ts` carried its own separate, ad hoc password check, shown as a password field
to every account regardless of whether it had one: a Workspace account, which 0008 forbids ever
holding a password, was offered the field anyway and it was silently ignored server-side.

Matt's direction on 10 September 2026 (A-128) is explicit: the passkey's second factor counts per
session, never per account, because a passkey sitting unused on another device proves nothing
about whoever is signing in with a password right now; and sensitive actions re-assert identity in
a modal at the moment they are taken, rather than being gated by how the session began or by
sending the person away to sign in again.

## Decision

**The session records which factor satisfied it, as an enum, never as an account-level flag.**
`shared/utils/session-factor.ts` adds `SessionFactor` (`password`, `totp`, `recovery-code`,
`google`, `passkey`, `magic-link`) and a pure `satisfiesSecondFactor(factor)`. `startSession` now
takes the factor that proved this particular sign-in and writes it onto the session; `resealSession`
carries it forward exactly as it already carried `signedInAt` forward across a name or address
change (A-113 criterion 2). Nothing about an account's factors is read to decide whether a *session*
counts as second-factor-satisfied; only what proved this session is. Registering a passkey
(`auth/passkey/register.post.ts`) writes no session state at all, so it cannot retroactively mark
anything satisfied.

**A modal accepts a factor at least as strong as the one that opened the session, resolved fresh
against the account's current state, never cached from sign-in.** `shared/utils/reauthentication.ts`
exports `reauthOptions`, a pure function of the session's factor and the account's current password,
confirmed TOTP and passkey ownership: a passkey session offers only a passkey; a Google (Workspace)
session offers a fresh Google assertion or a passkey, and a password field is never one of its
options, because 0008 forbids one ever existing there; a password session offers the password plus,
where the account currently holds a confirmed TOTP factor, that code too. `GET /api/account/
reauthenticate` serves this; `POST /api/account/reauthenticate/password` and `.../passkey` answer
it, writing one audit action, `session.reauthenticated`, with `detail: { factor }` and no personal
free text (0011). A Google reassertion is a full OAuth round trip
(`server/middleware/google-return.ts`, `server/routes/auth/google.get.ts`), because there is no way
to ask Google for a fresh assertion without leaving the page; it lands back on the same page with
`?reauthenticated=1`, and `useReauthenticateReturn` turns that into a toast telling the person to
try their action again rather than resuming it automatically. That is a real, accepted UX gap
against the button-click convenience of the other two paths, chosen because inventing a
resume-after-redirect mechanism for one factor was judged not worth it against how rarely a
Workspace account without a passkey will hit it.

**The existing freshness gate is extended, not duplicated.** `requireFreshSession`'s ten-minute
constant becomes the configurable `REAUTH_WINDOW_MINUTES` (`shared/utils/config.ts`,
`docs/workshops.md`), read by both the original A-109/A-110 "change a security setting" gate and
A-128's reassertion. A successful reassertion calls the new `reassertSession`, which bumps
`signedInAt` to now without writing `lastLoginAt` or a `session.started.*` audit row: it is not a
new sign-in, only a renewed proof of the one already open. The comparison itself,
`shared/utils/freshness.ts`'s `isFresh`, is a pure function of `(signedInAt, windowMinutes, now)`,
kept separate from the network and database calls around it so a stale confirmation is a fast unit
test rather than a real ten-minute wait.

**The criterion-6 survey's outcome: every one of the ten routes above is left on `requireFreshSession`
unchanged, and every one of them is now satisfiable by the modal, because the modal's success is
exactly what that gate already asked for.** No route needed its own new gate. `account/close.post.ts`
loses its ad hoc password field outright: the modal already re-asserts identity before the request
is made, and the named defect, a password field a Workspace account cannot fill, is removed rather
than special-cased. `account/password.put.ts` has no page built against it yet; nothing here changes
until one exists, and it will work unmodified when it does, since the gate it already calls is the
one the modal now satisfies.

## Consequences

- The session gains one field, `factor: SessionFactor`, in `shared/types/auth.d.ts`. This repository
  declares its own session shape there rather than importing `@newtheatre/auth-types`: proscenium
  does not currently depend on that package (there is no reference to it anywhere in this
  repository), so this addition needs no coordinated release with `stage-door` or another consumer.
  If proscenium later adopts the published package, this divergence is what a migration onto it
  would need to reconcile.
- `mfa.confirmed`'s reissue and every `session.started.*` sign-in path now name their factor
  explicitly; a fifth sign-in path added later must do the same or `satisfiesSecondFactor` reads it
  as unproven.
- Two reauthentication routes join the audit coverage registry (`shared/utils/audit-coverage.ts`)
  under one action, `session.reauthenticated`, rather than one action per factor: a reader of the
  audit trail sees that identity was re-confirmed and for which factor, in the detail, without the
  catalogue growing a row per factor per route.
