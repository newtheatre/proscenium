import { and, eq } from 'drizzle-orm'

// Single-use tokens for the paths that prove a mailbox (A-102). The plaintext exists only in
// the email; the database holds its hash, so a leaked backup grants nothing.

export const TOKEN_KINDS = ['EMAIL_VERIFY', 'PASSWORD_RESET', 'MAGIC_LINK', 'SET_PASSWORD'] as const
export type TokenKind = (typeof TOKEN_KINDS)[number]

export const VERIFY_TOKEN_HOURS = 24

async function hashToken(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintext))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export interface IssuedToken { plaintext: string, expiresAt: Date }

// Issuing replaces any outstanding token of the same kind, so an older link stops working the
// moment a newer one is asked for (A-102 criterion 1).
export async function issueToken(userId: string, kind: TokenKind, hours = VERIFY_TOKEN_HOURS, email?: string): Promise<IssuedToken> {
  const plaintext = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)

  await db.batch([
    db.delete(schema.authTokens).where(and(
      eq(schema.authTokens.userId, userId),
      eq(schema.authTokens.kind, kind),
    )),
    db.insert(schema.authTokens).values({
      id: crypto.randomUUID().replaceAll('-', ''),
      userId,
      kind,
      tokenHash: await hashToken(plaintext),
      email: email ?? null,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    }),
  ])

  return { plaintext, expiresAt }
}

export interface ClaimedToken { userId: string, email: string | null }

// Delete-as-claim, in one statement: the row is removed and returned together, so two racing
// redemptions cannot both succeed (A-108 criterion 3). Whoever gets the row has the claim.
export async function claimToken(plaintext: string, kind: TokenKind): Promise<ClaimedToken | null> {
  const [row] = await db.delete(schema.authTokens).where(and(
    eq(schema.authTokens.tokenHash, await hashToken(plaintext)),
    eq(schema.authTokens.kind, kind),
  )).returning({
    userId: schema.authTokens.userId,
    email: schema.authTokens.email,
    expiresAt: schema.authTokens.expiresAt,
  })

  if (!row) return null

  // An expired token is spent by claiming it, so a stale link is gone rather than left sitting
  // there looking usable.
  if (row.expiresAt * 1000 <= Date.now()) return null

  return { userId: row.userId, email: row.email }
}
