import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { newId } from './accounts'
import { auditedWrite } from './audit'
import { postEntry, runLedgerBatch } from './ledger'
import { passCapAllows } from './pass-types'
import { auditEntry } from '#shared/utils/audit'
import { generatePassReference } from '#shared/utils/passes'
import type { BatchItem } from 'drizzle-orm/batch'

// D-124: issuing a pass at the desk and requesting one online. Kept apart from
// server/utils/passes.ts's reads, matching D-114's own collect/desk split.

export interface IssuePassWriteInput {
  passTypeId: string
  passTypePriceId: string
  maxIssued: number | null
  userId: string
  pricePaid: number
  actorId: string
  // Fulfils the named request in the same batch, one-tap at payment (criterion 3).
  requestId?: string
}

export interface IssuePassResult {
  applied: boolean
  passId?: string
  reference?: string
  entryId?: string
}

// Race-safe (criterion 4): the cap is the insert's own predicate, and `postEntry`'s guard rides
// its `changes()`, so a refused issue posts no ledger entry (0001, D-116's own pattern).
export async function issuePass(input: IssuePassWriteInput, at = new Date()): Promise<IssuePassResult> {
  const passId = newId()
  const reference = generatePassReference()

  const passInsert = sql`
    INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by)
    SELECT ${passId}, ${reference}, ${input.passTypeId}, ${input.passTypePriceId}, ${input.userId}, ${input.pricePaid}, 'ACTIVE', ${input.actorId}
    WHERE ${passCapAllows(input.passTypeId, input.maxIssued)}
    RETURNING id
  `

  const posted = postEntry({
    source: 'DESK',
    tender: 'CARD',
    actorId: input.actorId,
    // No dedicated column names a pass (0033); `priceRef` is the same unconstrained slot
    // F-121's own price resolution rides, reused here to carry the pass's own id.
    lines: [{ kind: 'PASS_SALE', amountPence: input.pricePaid, qty: 1, unitPricePence: input.pricePaid, priceRef: passId }],
  }, at, sql`changes() = 1`)

  const entry = auditEntry({
    actorId: input.actorId,
    action: 'pass.issued',
    target: `pass:${passId}`,
    detail: { passTypeId: input.passTypeId, userId: input.userId, pricePaid: input.pricePaid },
  })

  const fulfilled = input.requestId
    ? auditEntry({
        actorId: input.actorId,
        action: 'pass.request.fulfilled',
        target: `pass-request:${input.requestId}`,
        detail: { passId },
      })
    : undefined

  const fulfilStatements: BatchItem<'sqlite'>[] = fulfilled
    ? [
        db.run(sql`
          UPDATE pass_requests SET status = 'FULFILLED', pass_id = ${passId}, decided_by = ${input.actorId}, decided_at = unixepoch()
          WHERE id = ${input.requestId} AND status = 'PENDING'
            AND EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${posted.id})
        `),
        db.run(sql`
          INSERT INTO audit_log (id, actor_id, action, target, detail)
          SELECT ${fulfilled.id}, ${fulfilled.actorId}, ${fulfilled.action}, ${fulfilled.target}, ${JSON.stringify(fulfilled.detail)}
          WHERE changes() = 1
        `),
      ]
    : []

  const [claimed] = await runLedgerBatch([
    db.all<{ id: string }>(passInsert),
    ...posted.statements,
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${posted.id})
    `),
    ...fulfilStatements,
  ])

  const applied = Array.isArray(claimed) && claimed.length > 0
  return { applied, passId: applied ? passId : undefined, reference: applied ? reference : undefined, entryId: applied ? posted.id : undefined }
}

// Criterion 3: reserves nothing, admits nobody. No capacity or cap check here at all; that is
// entirely issue's job, at payment (criterion 4).
export async function requestPass(passTypeId: string, userId: string): Promise<{ id: string }> {
  const id = newId()
  const entry = auditEntry({ actorId: userId, action: 'pass.request.created', target: `pass-type:${passTypeId}` })

  await db.batch([
    db.run(sql`INSERT INTO pass_requests (id, pass_type_id, user_id, status) VALUES (${id}, ${passTypeId}, ${userId}, 'PENDING')`),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${entry.detail !== null ? JSON.stringify(entry.detail) : null}
      WHERE changes() = 1
    `),
  ])

  return { id }
}

export interface ExpirePassRequestsRun {
  eligible: number
  expired: number
}

// A request lapses once its product's own sales window has closed (criterion 3); D-106's own
// hold-release shape, one conditional UPDATE per row rather than a single unbounded statement.
export async function expireStalePassRequests(now: Date, cap: number): Promise<ExpirePassRequestsRun> {
  const at = Math.floor(now.getTime() / 1000)
  const candidates = await db.all<{ id: string }>(sql`
    SELECT r.id AS id FROM pass_requests r
    JOIN pass_types t ON t.id = r.pass_type_id
    WHERE r.status = 'PENDING' AND t.sales_close_at IS NOT NULL AND t.sales_close_at <= ${at}
    ORDER BY r.created_at
    LIMIT ${cap}
  `)

  let expired = 0
  for (const candidate of candidates) {
    const entry = auditEntry({ actorId: null, action: 'pass.request.expired', target: `pass-request:${candidate.id}` })
    const applied = await auditedWrite(
      db.all<{ id: string }>(sql`
        UPDATE pass_requests SET status = 'EXPIRED', decided_at = unixepoch()
        WHERE id = ${candidate.id} AND status = 'PENDING'
        RETURNING id
      `),
      entry,
    )
    if (applied) expired += 1
  }

  return { eligible: candidates.length, expired }
}
