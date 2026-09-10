import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { newId } from './accounts'
import { postEntry } from './ledger'
import { auditEntry } from '#shared/utils/audit'
import { generatePassReference } from '#shared/utils/passes'
import type { BatchItem } from 'drizzle-orm/batch'
import type { AuditRow } from '#shared/utils/audit'

// D-130: the lifetime entitlement a fellowship carries (0023). `slug = 'fellowship'` is what
// server/utils/pass-redemption.ts reads to cover every show and mask the type name.

// `valid_until` is NOT NULL, so "no expiry" is this column's own ceiling rather than a real date.
export const FELLOWSHIP_NEVER_EXPIRES = Math.floor(Date.UTC(9999, 0, 1) / 1000)

// Never sold, never shown at the desk (`sellablePassTypesQuery` reads only `ON_SALE`); `DRAFT` is
// the closest true status, since redemption itself only ever refuses `CLOSED` (0023).
export async function ensureFellowshipPassType(): Promise<{ passTypeId: string, priceId: string }> {
  const [existing] = await db.all<{ id: string, priceId: string }>(sql`
    SELECT t.id AS id, p.id AS priceId FROM pass_types t
    JOIN pass_type_prices p ON p.pass_type_id = t.id
    WHERE t.slug = 'fellowship' LIMIT 1
  `)
  if (existing) return { passTypeId: existing.id, priceId: existing.priceId }

  const passTypeId = newId()
  const priceId = newId()
  await db.batch([
    db.run(sql`
      INSERT INTO pass_types (id, slug, name, status, valid_from, valid_until)
      VALUES (${passTypeId}, 'fellowship', 'Fellowship', 'DRAFT', 0, ${FELLOWSHIP_NEVER_EXPIRES})
      ON CONFLICT (slug) DO NOTHING
    `),
    db.run(sql`
      INSERT INTO pass_type_prices (id, pass_type_id, label, price)
      SELECT ${priceId}, t.id, 'Fellowship', 0 FROM pass_types t WHERE t.slug = 'fellowship'
      ON CONFLICT (pass_type_id, label) DO NOTHING
    `),
  ])
  const [row] = await db.all<{ id: string, priceId: string }>(sql`
    SELECT t.id AS id, p.id AS priceId FROM pass_types t
    JOIN pass_type_prices p ON p.pass_type_id = t.id
    WHERE t.slug = 'fellowship' LIMIT 1
  `)
  return { passTypeId: row!.id, priceId: row!.priceId }
}

export interface FellowshipPassStatements {
  passId: string
  statements: BatchItem<'sqlite'>[]
}

// A-127 criterion 3's amendment: awarding issues the pass in the same batch as the record.
// Uncapped and never bought, so no cap predicate, only a zero-value PASS_SALE line.
export async function fellowshipPassStatements(userId: string, actorId: string | null): Promise<FellowshipPassStatements> {
  const { passTypeId, priceId } = await ensureFellowshipPassType()
  const passId = newId()
  const reference = generatePassReference()

  // Money that did not move, the same reasoning a pass admission itself posts under
  // (architecture.md): nobody tendered anything, because nobody was at a desk.
  const posted = postEntry({
    source: 'SYSTEM',
    tender: 'NONE',
    actorId,
    lines: [{ kind: 'PASS_SALE', amountPence: 0, qty: 1, unitPricePence: 0, priceRef: passId }],
  })

  const entry: AuditRow = auditEntry({
    actorId,
    action: 'pass.issued',
    target: `pass:${passId}`,
    detail: { passTypeId, userId },
  })

  return {
    passId,
    statements: [
      db.run(sql`
        INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by)
        VALUES (${passId}, ${reference}, ${passTypeId}, ${priceId}, ${userId}, 0, 'ACTIVE', ${userId})
      `),
      ...posted.statements,
      db.run(sql`
        INSERT INTO audit_log (id, actor_id, action, target, detail)
        SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
        WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${posted.id})
      `),
    ],
  }
}

// D-130 criterion 4: revocation stops future admissions and rewrites nothing already taken. The
// pass itself is what `passAdmissionAllows` reads, so cancelling it is the whole mechanism.
export function cancelFellowshipPassStatement(userId: string): BatchItem<'sqlite'> {
  return db.run(sql`
    UPDATE passes SET status = 'CANCELLED', updated_at = unixepoch()
    WHERE user_id = ${userId} AND status = 'ACTIVE'
      AND pass_type_id = (SELECT id FROM pass_types WHERE slug = 'fellowship')
  `)
}
