// Ticket presets (show walkthrough, decisions 2 and 8): what a new show's tickets start from.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import presetsGet from '../../server/api/box-office/ticket-presets/index.get'
import presetsPost from '../../server/api/box-office/ticket-presets/index.post'
import presetPut from '../../server/api/box-office/ticket-presets/[id].put'
import presetDelete from '../../server/api/box-office/ticket-presets/[id].delete'
import { presetFor, seedTickets } from '../../server/ticket-presets'
import { house, manager, NOV_16, ready, req } from './stage'

const handle = server({
  'GET /api/box-office/ticket-presets': presetsGet,
  'POST /api/box-office/ticket-presets': presetsPost,
  'PUT /api/box-office/ticket-presets/:id': presetPut,
  'DELETE /api/box-office/ticket-presets/:id': presetDelete,
})
let keys = 0
async function api<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> = manager): Promise<{ status: number, body: T }> {
  const response = await call(handle, method, path, { actor, body, headers: method === 'GET' ? {} : { 'idempotency-key': `tp${++keys}` } })
  return { status: response.status, body: await response.json() as T }
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
})

describe('a new site', () => {
  it('is given Full price, Concession and an unpriced "Usual tickets" preset as its usual, once', async () => {
    const seed = () => inContext(async () => {
      const unit = createUnit()
      await seedTickets(unit.view())
      await unit.commit()
    })
    await seed()
    const types = await rows<{ name: string, kind: string }>('SELECT name, kind FROM box_office_ticket_types WHERE managed_by IS NULL ORDER BY sort')
    expect(types).toEqual([{ name: 'Full price', kind: 'standard' }, { name: 'Concession', kind: 'concession' }])
    const listed = await api('GET', '/api/box-office/ticket-presets')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(listed.body.rows).toEqual([expect.objectContaining({ name: 'Usual tickets', sections: [{ name: null, seats: null, prices: [] }] })])
    expect(listed.body.usual).toBe(listed.body.rows[0].id)
    // Switching Box office off and on again adds nothing.
    await seed()
    expect(await rows('SELECT id FROM box_office_ticket_presets')).toHaveLength(1)
    expect(await rows('SELECT id FROM box_office_ticket_types WHERE managed_by IS NULL')).toHaveLength(2)
  })
})

describe('ticket presets', () => {
  it('are made, priced by section, given to spaces, changed and deleted', async () => {
    const h = await house(10)
    const [{ space_id: spaceId }] = await rows<{ space_id: string }>('SELECT space_id FROM core_performances WHERE id = ?', h.performanceId) as [{ space_id: string }]
    const made = await api('POST', '/api/box-office/ticket-presets', {
      name: 'Studio show',
      sections: [{ name: 'Stalls', seats: 70, prices: [{ ticketTypeId: h.fullId, amountMinor: 1400 }] }, { name: 'Balcony', seats: null, prices: [{ ticketTypeId: h.fullId, amountMinor: 1000 }] }],
      spaceIds: [spaceId],
    })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect((await inContext(() => presetFor(spaceId)))?.name).toBe('Studio show')
    // Another space falls back to the theatre's usual preset.
    expect((await inContext(() => presetFor('spc_elsewhere')))?.name).toBe('Usual tickets')

    expect((await api('POST', '/api/box-office/ticket-presets', { name: 'studio SHOW', sections: [{ name: null, seats: null, prices: [] }] })).body.code).toBe('box-office.ticket-preset.name-taken')
    expect((await api('POST', '/api/box-office/ticket-presets', { name: 'Two', sections: [{ name: 'Stalls', seats: null, prices: [] }, { name: '', seats: null, prices: [] }] })).body.code).toBe('box-office.ticket-preset.section-name')

    const changed = await api('PUT', `/api/box-office/ticket-presets/${made.body.id}`, { name: 'Studio', sections: [{ name: null, seats: null, prices: [{ ticketTypeId: h.concessionId, amountMinor: 600 }] }], spaceIds: [] })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    const listed = (await api('GET', '/api/box-office/ticket-presets')).body.rows.find((p: { id: string }) => p.id === made.body.id)
    expect(listed).toMatchObject({ name: 'Studio', spaceIds: [], sections: [{ name: null, seats: null, prices: [{ ticketTypeId: h.concessionId, amountMinor: 600 }] }] })

    expect((await api('DELETE', `/api/box-office/ticket-presets/${made.body.id}`, {})).status).toBe(200)
    expect((await api('DELETE', `/api/box-office/ticket-presets/${made.body.id}`, {})).body.code).toBe('box-office.ticket-preset.not-found')
  })

  it('cannot be changed by someone who does not price tickets', async () => {
    expect((await api('GET', '/api/box-office/ticket-presets', undefined, person([]))).status).toBe(403)
    void req
  })
})
