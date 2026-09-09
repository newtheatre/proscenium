import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { createError } from 'h3'
import { postEntry } from './ledger'
import { auditEntry } from '#shared/utils/audit'
import { amountDueFor } from '#shared/utils/desk'
import type { DeskTicketLine } from './desk'
import type { CollectInput } from '#shared/utils/desk'
import type { BatchItem } from 'drizzle-orm/batch'

// The collection write, kept apart from server/utils/desk.ts's read-only queries so `tests/`
// never has to resolve this file's imports under Bun (CONTRIBUTING).

export interface CollectResult {
  entryId: string
  totalPence: number
}

// The payment boundary (criterion 2): the reservation's conditional UPDATE and its ledger entry
// are one batch, guarded by a trigger that refuses a line whose reservation is not COLLECTED (0001).
export async function collect(input: CollectInput, actorId: string, tickets: DeskTicketLine[]): Promise<CollectResult> {
  const ticketTotalPence = tickets.reduce((total, ticket) => total + ticket.pricePaid, 0)
  const totalPence = amountDueFor(input.tender, ticketTotalPence)

  const posted = postEntry({
    source: 'DESK',
    tender: input.tender,
    actorId,
    compReason: input.tender === 'COMP' ? input.compReason : undefined,
    compApprovedBy: input.tender === 'COMP' ? actorId : undefined,
    lines: tickets.map(ticket => ({
      kind: 'TICKET_COLLECTION',
      amountPence: input.tender === 'COMP' ? 0 : ticket.pricePaid,
      qty: 1,
      unitPricePence: ticket.pricePaid,
      reservationId: input.reservationId,
      ticketId: ticket.ticketId,
    })),
  })

  const entry = auditEntry({
    actorId,
    action: 'reservation.collected',
    target: `reservation:${input.reservationId}`,
    detail: { tender: input.tender, totalPence },
  })

  const statements: BatchItem<'sqlite'>[] = [
    db.run(sql`
      UPDATE reservations SET status = 'COLLECTED', hold_expires_at = NULL, updated_at = unixepoch()
      WHERE id = ${input.reservationId} AND status = 'PENDING'
    `),
    ...posted.statements,
    db.insert(schema.auditLog).values(entry),
  ]

  try {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('ledger_lines_ticket_collection_needs_collected_reservation')) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This booking is no longer available to collect: it may already have been collected. Check its current status and try again.',
      })
    }
    throw error
  }

  return { entryId: posted.id, totalPence }
}
