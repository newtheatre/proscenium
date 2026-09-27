import { eq } from 'drizzle-orm'
import { localPath } from '#shared/utils/local-path'
import { landingAfterSignIn } from '#shared/utils/night-authority'
import { afterLostGoogleClaim, googleClaimStatement } from '#shared/utils/google-sign-in'
import type { CandidateAccount } from '#shared/utils/google-sign-in'

function candidate(row: { id: string, googleSub: string | null, disabled: boolean, anonymisedAt: number | null } | undefined): CandidateAccount | null {
  return row ?? null
}

const RETURN_COOKIE = 'nnt-after-google'

// Sign in with a Workspace Google account.
export default defineOAuthGoogleEventHandler({
  config: { scope: ['email', 'profile'], authorizationParams: { hd: WORKSPACE_DOMAIN } },

  async onSuccess(event, { user }) {
    const identity = {
      email: normaliseEmail(String(user.email ?? '')),
      emailVerified: user.email_verified === true,
      hostedDomain: typeof user.hd === 'string' ? user.hd : null,
      sub: String(user.sub ?? ''),
    }

    const [bySub] = identity.sub
      ? await db.select().from(schema.users).where(eq(schema.users.googleSub, identity.sub)).limit(1)
      : []
    const [byPendingEmail] = await db.select().from(schema.users).where(eq(schema.users.pendingGoogleEmail, identity.email)).limit(1)
    const [byEmail] = await db.select().from(schema.users).where(eq(schema.users.email, identity.email)).limit(1)

    const outcome = resolveGoogleSignIn(identity, {
      bySub: candidate(bySub as never),
      byPendingEmail: candidate(byPendingEmail as never),
      byEmail: candidate(byEmail as never),
    })

    if (outcome.action === 'refuse') {
      // The code names no account state: an attacker holding the credentials must not learn
      // that the account was disabled (A-122 criterion 2).
      const code = outcome.reason === 'disabled' ? 'account' : outcome.reason
      return sendRedirect(event, `/sign-in?refused=${code}`)
    }

    const userId = outcome.action === 'create' ? newId() : outcome.userId
    const name = String(user.name ?? identity.email)
    const now = Math.floor(Date.now() / 1000)

    if (outcome.action === 'create') {
      // Verified by Google and password-less by construction; the CHECK refuses one anyway (0008).
      await db.batch([
        db.insert(schema.users).values({
          id: userId, email: identity.email, name, googleSub: identity.sub, verified: true, googleLinkedAt: now,
        }),
        db.insert(schema.auditLog).values(auditEntry({ actorId: null, action: 'account.created.google', target: `user:${userId}` })),
      ])
    }
    else if (outcome.action !== 'sign-in') {
      // Claiming marks the account verified: Google has proven the address (A-104). Logged only if
      // this callback took the claim; the account's state rides the claim, so a beaten one takes nothing.
      const claimed = await auditedWrite(
        db.all<{ id: string }>(googleClaimStatement(userId, identity.sub, now)),
        auditEntry({
          actorId: userId,
          action: outcome.action === 'claim-pending' ? 'account.google.claimed.pending' : 'account.google.claimed',
          target: `user:${userId}`,
        }),
      )
      if (!claimed) {
        // An erasure or a disable that beat the claim is refused as any unusable account is (A-122);
        // otherwise a second callback that lost signs in only as the same identity.
        const current = await findById(userId)
        if (!current || current.anonymisedAt !== null || current.disabled) return sendRedirect(event, '/sign-in?refused=account')
        if (afterLostGoogleClaim(current.googleSub, identity.sub) === 'REFUSE') return sendRedirect(event, '/sign-in?refused=linked-elsewhere')
      }
    }

    // An erasure or a disable landing since the read leaves nothing to sign in to, and says no more (A-122).
    const account = await findById(userId)
    if (!account || account.anonymisedAt !== null || account.disabled) return sendRedirect(event, '/sign-in?refused=account')

    const asked = getCookie(event, RETURN_COOKIE)
    // Only a path on this site, so the return trip cannot be pointed at somebody else's.
    const after = localPath(asked) ?? '/'
    deleteCookie(event, RETURN_COOKIE)

    // A reassertion, not a sign-in: it must land back on the same account already in session, or
    // it proves nothing about who is asking (A-128 criteria 3 and 4).
    if (getCookie(event, 'nnt-reauth') === '1') {
      deleteCookie(event, 'nnt-reauth')
      const current = await getUserSession(event)
      if (outcome.action !== 'sign-in' || current?.user?.id !== account.id) {
        return sendRedirect(event, '/sign-in?refused=account')
      }
      await db.batch([
        db.update(schema.users).set({ googleLastUsedAt: now }).where(eq(schema.users.id, account.id)),
        db.insert(schema.auditLog).values(auditEntry({ actorId: account.id, action: 'session.reauthenticated', target: `user:${account.id}`, detail: { factor: 'google' } })),
      ])
      await reassertSession(event, account, 'google')
      return sendRedirect(event, `${after}${after.includes('?') ? '&' : '?'}reauthenticated=1`)
    }

    await db.batch([
      db.update(schema.users).set({ lastLoginAt: now, googleLastUsedAt: now }).where(eq(schema.users.id, account.id)),
      db.insert(schema.auditLog).values(auditEntry({ actorId: account.id, action: 'session.started.google', target: `user:${account.id}` })),
    ])
    await startSession(event, account, 'google')

    // Where they were when they were asked to sign in again, remembered across the round trip;
    // with nowhere asked, somebody on shift lands on Tonight (0094).
    return sendRedirect(event, landingAfterSignIn(asked, await onShiftTonight(event, account.id)))
  },

  onError(event, error) {
    console.error('[auth/google]', error.message)
    return sendRedirect(event, '/sign-in?refused=google')
  },
})
