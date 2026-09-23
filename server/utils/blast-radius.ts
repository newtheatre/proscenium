import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING, 0055).
import { PERMISSION_MAP, ROLES } from '#shared/utils/roles'
import { dueForAnonymisation } from './retention-candidates'
import type { BlastRadiusPreview } from '#shared/utils/blast-radius'
import type { ConfigKey } from '#shared/utils/config'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// What a flagged setting's own blast radius is, one function per key (J-105 criterion 1). No
// entry here means the key carries the flag but nobody has written its preview yet.

// Whoever holds the desk (`ticketing.write`) without also holding a role that carries
// `money.refund`: exactly who gains or loses self-approval when the setting flips either way.
export function officersWithoutRefundApprovalQuery(officerRoles: string[], approvingRoles: string[]): SQL {
  return sql`
    SELECT count(DISTINCT rg.user_id) AS count
    FROM role_grants rg
    WHERE rg.role IN (${sql.join(officerRoles.map(role => sql`${role}`), sql`, `)})
      AND (rg.expires_at IS NULL OR rg.expires_at > unixepoch())
      AND NOT EXISTS (
        SELECT 1 FROM role_grants other
        WHERE other.user_id = rg.user_id
          AND other.role IN (${sql.join(approvingRoles.map(role => sql`${role}`), sql`, `)})
          AND (other.expires_at IS NULL OR other.expires_at > unixepoch())
      )
  `
}

// Read from the permission map, never a role named here, so a merge like 0090's moves the count.
export function refundPreviewRoles(): { officers: string[], approving: string[] } {
  const approving = ROLES.filter(role => PERMISSION_MAP[role].includes('money.refund'))
  const officers = ROLES.filter(role => PERMISSION_MAP[role].includes('ticketing.write') && !approving.includes(role))
  return { officers, approving }
}

async function officersWithoutRefundApproval(): Promise<number> {
  const { officers, approving } = refundPreviewRoles()
  if (!officers.length) return 0
  const [row] = await db.all<{ count: number }>(officersWithoutRefundApprovalQuery(officers, approving))
  return row?.count ?? 0
}

const PREVIEWS: Partial<Record<ConfigKey, (event: H3Event | undefined) => Promise<BlastRadiusPreview>>> = {
  REFUND_PAID_REQUIRES_MANAGER: async () => ({
    count: await officersWithoutRefundApproval(),
    category: 'box office officers who can self-approve a refund without this setting',
  }),
  RETENTION_ARMED: async event => ({
    count: await dueForAnonymisation(event),
    category: 'accounts already due anonymisation, the moment this is armed',
  }),
}

export async function blastRadiusPreview(event: H3Event | undefined, key: ConfigKey): Promise<BlastRadiusPreview | null> {
  const preview = PREVIEWS[key]
  return preview ? preview(event) : null
}
