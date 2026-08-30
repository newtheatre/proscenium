import { desc, eq, or, sql } from 'drizzle-orm'
import { isRole } from '#shared/utils/roles'

const RECENT_ENTRIES = 25

// One person, and everything the directory could not fit on a row (A-121 criterion 5).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'accounts.read')
  const id = getRouterParam(event, 'id') ?? ''

  const account = await findById(id)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })

  const now = Math.floor(Date.now() / 1000)

  const grants = await db.select({
    role: schema.roleGrants.role,
    expiresAt: schema.roleGrants.expiresAt,
    grantedAt: schema.roleGrants.grantedAt,
    grantedBy: schema.roleGrants.grantedBy,
  }).from(schema.roleGrants).where(eq(schema.roleGrants.userId, id))

  const [factor] = await db.select({ confirmedAt: schema.totpSecrets.confirmedAt })
    .from(schema.totpSecrets)
    .where(eq(schema.totpSecrets.userId, id))
    .limit(1)

  const passkeys = await db.select({ id: schema.passkeys.id })
    .from(schema.passkeys).where(eq(schema.passkeys.userId, id))

  const codes = await db.select({ id: schema.recoveryCodes.id })
    .from(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, id))

  const memberships = await db.select({ year: schema.memberships.year, source: schema.memberships.source })
    .from(schema.memberships).where(eq(schema.memberships.userId, id))

  const [fellowship] = await db.select({
    id: schema.fellowships.id,
    awardedOn: schema.fellowships.awardedOn,
    awardedBy: schema.fellowships.awardedBy,
    citation: schema.fellowships.citation,
    revokedAt: schema.fellowships.revokedAt,
  }).from(schema.fellowships).where(eq(schema.fellowships.userId, id)).limit(1)

  // The trail for one person, which is what triage needs. Searching the whole of it is J-103.
  const history = resolved.permissions.has('audit.read')
    ? await db.select({
        action: schema.auditLog.action,
        target: schema.auditLog.target,
        detail: schema.auditLog.detail,
        createdAt: schema.auditLog.createdAt,
        byThem: schema.auditLog.actorId,
      })
        .from(schema.auditLog)
        .where(or(eq(schema.auditLog.actorId, id), eq(schema.auditLog.target, `user:${id}`)))
        // Several entries share a second, so insertion order breaks the tie rather than chance.
        .orderBy(desc(schema.auditLog.createdAt), desc(sql`rowid`))
        .limit(RECENT_ENTRIES)
    : []

  return {
    account: {
      id: account.id,
      name: account.name,
      email: account.email,
      verified: account.verified,
      disabled: account.disabled,
      anonymisedAt: account.anonymisedAt,
    },
    methods: {
      password: account.password !== null,
      google: Boolean((account as { googleSub?: string | null }).googleSub),
      passkeys: passkeys.length,
      factor: Boolean(factor?.confirmedAt),
      recoveryCodesRemaining: codes.length,
    },
    grants: grants.filter(grant => isRole(grant.role)).map(grant => ({
      ...grant,
      live: grant.expiresAt === null || grant.expiresAt > now,
    })),
    memberships,
    fellowship: fellowship ?? null,
    history: history.map(entry => ({
      action: entry.action,
      target: entry.target,
      detail: entry.detail,
      createdAt: entry.createdAt,
      byThem: entry.byThem === id,
    })),
  }
})
