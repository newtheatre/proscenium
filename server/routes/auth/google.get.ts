import { and, eq, isNull } from 'drizzle-orm'
import type { CandidateAccount } from '#shared/utils/google-sign-in'

function candidate(row: { id: string, googleSub: string | null, disabled: boolean, anonymisedAt: number | null } | undefined): CandidateAccount | null {
  return row ?? null
}

const RETURN_COOKIE = 'nnt-after-google'

// Only a path on this site, so the return trip cannot be pointed at somebody else's.
function onwards(value: string | undefined): string {
  return value && /^\/(?!\/)/.test(value) ? value : '/'
}

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
      // Claiming marks the account verified: Google has proven the address (A-104).
      await db.batch([
        db.update(schema.users)
          .set({ googleSub: identity.sub, verified: true, pendingGoogleEmail: null, googleLinkedAt: now })
          .where(and(eq(schema.users.id, userId), isNull(schema.users.googleSub))),
        db.insert(schema.auditLog).values(auditEntry({
          actorId: userId,
          action: outcome.action === 'claim-pending' ? 'account.google.claimed.pending' : 'account.google.claimed',
          target: `user:${userId}`,
        })),
      ])
    }

    const account = await findById(userId)
    if (!account) return sendRedirect(event, '/sign-in?refused=account')

    await db.batch([
      db.update(schema.users).set({ lastLoginAt: now, googleLastUsedAt: now }).where(eq(schema.users.id, account.id)),
      db.insert(schema.auditLog).values(auditEntry({ actorId: account.id, action: 'session.started.google', target: `user:${account.id}` })),
    ])
    await startSession(event, account)

    // Where they were when they were asked to sign in again, remembered across the round trip.
    const after = onwards(getCookie(event, RETURN_COOKIE))
    deleteCookie(event, RETURN_COOKIE)
    return sendRedirect(event, after)
  },

  onError(event, error) {
    console.error('[auth/google]', error.message)
    return sendRedirect(event, '/sign-in?refused=google')
  },
})
