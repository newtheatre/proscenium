import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { normaliseEmail } from '#shared/utils/auth'
import { PASS_RESEND_SAYS, passResendForm } from '#shared/utils/passes'

const LIVE_PASSES_RESENT = 4

// D-138 criterion 4: a new device asks for the pass email again. The answer is the same whatever
// the address holds, so the form tells nobody who has a pass; the limits are the booking resend's.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, passResendForm)
  const email = normaliseEmail(input.email)
  const limit = await configValue(event, 'RESERVATION_RESEND_ATTEMPTS')
  const windowMinutes = await configValue(event, 'RESERVATION_RESEND_WINDOW_MINUTES')
  await enforce(event, { scope: 'pass:resend:ip', value: clientIp(event), limit, windowMinutes })
  await enforce(event, { scope: 'pass:resend:email', value: email, limit, windowMinutes })

  const now = Math.floor(Date.now() / 1000)
  const live = await db.all<{ id: string, userId: string, reference: string, passTypeName: string, priceLabel: string }>(sql`
    SELECT p.id AS id, p.user_id AS userId, p.reference AS reference, t.name AS passTypeName, c.label AS priceLabel
    FROM passes p
    JOIN users u ON u.id = p.user_id
    JOIN pass_types t ON t.id = p.pass_type_id
    JOIN pass_type_prices c ON c.id = p.pass_type_price_id
    WHERE u.email = ${email} AND u.anonymised_at IS NULL AND u.disabled = 0
      AND p.status = 'ACTIVE' AND t.status != 'CLOSED' AND t.valid_until >= ${now}
    ORDER BY p.created_at DESC
    LIMIT ${LIVE_PASSES_RESENT}
  `)
  for (const pass of live) {
    await sendPassIssued(event, { userId: pass.userId, reference: pass.reference, passTypeName: pass.passTypeName, priceLabel: pass.priceLabel }, pass.id)
  }

  return { ok: true, message: PASS_RESEND_SAYS }
})
