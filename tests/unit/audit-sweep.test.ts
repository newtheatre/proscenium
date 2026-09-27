import { describe, expect, test } from 'bun:test'
import { afterLostGoogleClaim } from '#shared/utils/google-sign-in'

// Decision 0049's audit half at the ten sites that could log a write that changed nothing: each
// now rides the write's own batch, conditioned on it. The SQL is in the integration suite.

const source = (path: string): Promise<string> => Bun.file(path).text()

// The text of one exported function, from its declaration to the next top-level close.
function body(text: string, name: string): string {
  const start = text.indexOf(`export async function ${name}(`)
  return text.slice(start, text.indexOf('\n}\n', start))
}

describe('every site audits through the write, never beside it', () => {
  const SITES: [string, string, string][] = [
    ['1. a walk-in', 'server/api/admin/training/sessions/[id]/attendees.post.ts', 'auditedWrite(db.all<{ id: string }>(walkInStatement('],
    ['2. cancelling a performance', 'server/api/admin/performances/[id]/cancel.post.ts', 'db.run(auditIfChanged(entry))'],
    ['7. a performance on or off sale', 'server/api/admin/performances/[id]/sale.post.ts', 'auditedWrite(db.all<{ id: string }>(performanceSaleStatement('],
    ['8. planning a bar opening', 'server/api/rota/openings/index.post.ts', 'auditIfRow(entry, \'bar_openings\', openingId)'],
    ['9. a venue\'s shift template', 'server/api/admin/rota/templates/[venueId]/index.put.ts', 'auditWhere(entry, templateVenueIsOurs(venueId))'],
    ['10. removing the authenticator app', 'server/api/account/mfa/index.delete.ts', 'db.run(auditIfChanged(entry))'],
  ]

  test.each(SITES)('%s', async (_, path, shape) => {
    const route = await source(path)
    expect(route).toContain(shape)
    expect(route).not.toContain('db.insert(schema.auditLog)')
  })

  // A new account and a session started are unconditional writes, so they keep their own rows.
  test('6. a Google claim logs only through its own write, and a lost one is settled by the account', async () => {
    const route = await source('server/routes/auth/google.get.ts')
    expect(route).toContain('const claimed = await auditedWrite(')
    expect(route).toContain('afterLostGoogleClaim(current?.googleSub ?? null, identity.sub)')
    expect(route.match(/action: outcome\.action === 'claim-pending'/g)).toHaveLength(1)
  })

  test('8. the opening\'s audit follows the insert it checks', async () => {
    const route = await source('server/api/rota/openings/index.post.ts')
    expect(route.indexOf('createOpeningStatement(openingId')).toBeGreaterThan(-1)
    expect(route.indexOf('auditIfRow(entry, \'bar_openings\', openingId)')).toBeGreaterThan(route.indexOf('createOpeningStatement(openingId'))
  })

  // A refused edit re-reads the booking, so capacity is blamed only while it is still pending (0049).
  test('3. a refused ticket edit says why from the booking as it now stands', async () => {
    const route = await source('server/api/qr/tickets.put.ts')
    const refusal = route.slice(route.indexOf('async function editRefusal('))
    expect(refusal).toContain('now?.status !== \'PENDING\'')
    // A booking that moved since the read is named before room is blamed (a double submit).
    expect(refusal).toContain('sameTicketLines(asRead, await currentTicketLines(reservationId))')
    expect(route).toContain('editRefusal(reservationId, current, \'This performance no longer has room for that change\')')
  })

  test('the walk-in logs only through the write that took, the first or the rejoin', async () => {
    const route = await source('server/api/admin/training/sessions/[id]/attendees.post.ts')
    expect(route).toContain('auditedWrite(db.all<{ id: string }>(walkInRejoinStatement(')
  })

  test('3. a ticket edit reports applied from its audit row, not from a read-back total', async () => {
    const edit = body(await source('server/utils/reservations.ts'), 'editReservationTickets')
    expect(edit).toContain('editTicketsStatements(input, entry)')
    expect(edit).not.toContain('currentTicketLines(')
    expect(edit).not.toContain('INSERT INTO audit_log')
  })

  test('4. a void logs only if its ledger entry was posted', async () => {
    const voiding = body(await source('server/utils/tab-settlement.ts'), 'voidTabCharge')
    expect(voiding).toContain('auditIfRow(entry, \'ledger_entries\', posted.id)')
    expect(voiding).not.toContain('db.insert(schema.auditLog)')
    // After the entry it checks, or it never logs and nothing fails to say so (0049).
    expect(voiding.indexOf('[...posted.statements]')).toBeGreaterThan(-1)
    expect(voiding.indexOf('auditIfRow(entry, \'ledger_entries\', posted.id)')).toBeGreaterThan(voiding.indexOf('[...posted.statements]'))
  })

  test('5. an erasure logs only if it anonymised the account, and says when it did not', async () => {
    const erasure = body(await source('server/utils/erasure.ts'), 'eraseAccount')
    expect(erasure).toContain('auditWhere(entry, sql`changes() = 1`)')
    expect(erasure).not.toContain('db.insert(schema.auditLog)')
    expect(erasure).toContain('alreadyErased: true')
  })
})

// 6. Two callbacks for one claim: the one that lost signs in only if the account went to this
// same Google identity; linked to another meanwhile, it is refused (A-104).
describe('a Google claim that lost its race', () => {
  test('the account now holds this identity: sign in, with no second claim logged', () => {
    expect(afterLostGoogleClaim('sub-1', 'sub-1')).toBe('SIGN_IN')
  })

  test('the account holds another identity, or none: refused as linked elsewhere', () => {
    expect(afterLostGoogleClaim('sub-2', 'sub-1')).toBe('REFUSE')
    expect(afterLostGoogleClaim(null, 'sub-1')).toBe('REFUSE')
  })
})
