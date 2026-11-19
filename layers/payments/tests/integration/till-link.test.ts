// Linking tills across accounts (../../server/till-link): the code one seller's device shows buys
// the seller who types it a pass to that seller's realtime room, and nobody else anything.
import { beforeAll, describe, expect, it } from 'vitest'
import { accountRoom, readTicket } from '#kit/realtime'
import ticketPost from '../../../core/server/api/core/realtime/ticket.post'
import linkCodePost from '../../server/api/payments/till/link-code.post'
import linkPost from '../../server/api/payments/till/link.post'
import { call, env, person, server, setModule } from '../../../../tests/integration/helpers'

const KEY = env.CORE_SESSION_KEY as string
const handle = server({ 'POST /api/core/realtime/ticket': ticketPost, 'POST /api/payments/till/link-code': linkCodePost, 'POST /api/payments/till/link': linkPost })

beforeAll(async () => {
  for (const id of ['finance', 'payments']) await setModule(id, true)
})

describe('linking tills by code', () => {
  const SELL = ['payments.session.open', 'payments.attempt.attest']
  const post = (path: string, actor: ReturnType<typeof person> | undefined, body: object) => call(handle, 'POST', path, { actor, body, headers: { 'idempotency-key': crypto.randomUUID() } })

  it('gives the seller who types a code a pass to the room of the seller who showed it, and nobody else', async () => {
    const [host, guest, stranger] = [person(SELL), person(SELL), person(SELL)]
    const { code } = await (await post('/api/payments/till/link-code', host, {})).json() as { code: string }
    expect(code).toMatch(/^\d{6}$/)
    const linked = await post('/api/payments/till/link', guest, { code })
    expect(linked.status).toBe(200)
    const { grant, expiresAt } = await linked.json() as { grant: string, expiresAt: number }
    expect(expiresAt).toBeGreaterThan(Date.now())

    const ticket = await (await post('/api/core/realtime/ticket', guest, { grant })).json() as { ticket: string }
    const read = await readTicket(KEY, ticket.ticket, Date.now())
    expect(read?.room).toBe(accountRoom(host.accountId!))
    expect(read?.accountId).toBe(guest.accountId)
    // The pass is the guest's alone, and does not survive being changed.
    expect((await post('/api/core/realtime/ticket', stranger, { grant })).status).toBe(403)
    expect((await post('/api/core/realtime/ticket', guest, { grant: `${grant}x` })).status).toBe(403)
  })

  it('refuses a wrong code, the seller\'s own code, and anyone who may not sell', async () => {
    const [host, guest] = [person(SELL), person(SELL)]
    const { code } = await (await post('/api/payments/till/link-code', host, {})).json() as { code: string }
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0')
    expect((await post('/api/payments/till/link', guest, { code: wrong })).status).toBe(404)
    expect((await post('/api/payments/till/link', host, { code })).status).toBe(409)
    expect((await post('/api/payments/till/link', person([]), { code })).status).toBe(403)
    expect((await post('/api/payments/till/link-code', person([]), {})).status).toBe(403)
    expect((await post('/api/payments/till/link', guest, { code: '12345' })).status).toBe(422)
  })
})
