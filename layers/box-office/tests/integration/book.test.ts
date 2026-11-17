// The public Choose tickets page's read (Box office specification, part 6, "Choose tickets"): only a
// published production's scheduled performance is shown, with each band's prices and whether it is
// sold out, never a count of seats; complimentary tickets are never offered.
import { beforeAll, describe, expect, it } from 'vitest'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { buy, house, ready, req, type House } from './stage'

const publisher = person(['core.production.edit', 'core.production.publish'])

/** Gives the production what publishing asks for, then publishes it. */
async function publish(h: House) {
  await inContext(async () => (await import('../../../core/server/vocabularies/service')).ensureVocabularies())
  const category = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.production-category' AND slug = 'play'"))[0]!.id
  const edited = await req('PATCH', `/api/core/productions/${h.productionId}`, { summary: 'A play to book for.', categoryTermId: category, advisoriesConfirmedNone: true }, publisher)
  expect(edited.status, JSON.stringify(edited.body)).toBe(200)
  return req('POST', `/api/core/productions/${h.productionId}/publish`, {}, publisher)
}
const read = (h: House) => req('GET', `/api/box-office/book/performances/${h.performanceId}`, undefined, null)

describe('the public booking page', () => {
  let h: House
  beforeAll(async () => {
    await ready()
    h = await house(2)
  })

  it('shows nothing until the production is published', async () => {
    const before = await read(h)
    expect(before.status).toBe(404)
    expect(before.body.code).toBe('box-office.book.not-found')
  })

  it('shows prices by band, and no counts, once published', async () => {
    const published = await publish(h)
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    const page = await read(h)
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body.state).toBe('on_sale')
    expect(page.body.production.id).toBe(h.productionId)
    expect(page.body.bands).toHaveLength(1)
    expect(page.body.bands[0].soldOut).toBe(false)
    expect(page.body.bands[0].types.map((t: { amountMinor: number }) => t.amountMinor).sort((a: number, b: number) => a - b)).toEqual([800, 1200])
    expect(JSON.stringify(page.body)).not.toMatch(/capacity|"free"|claimed/)
  })

  it('says a band is sold out when its last seat is held', async () => {
    const held = await buy(h, 2)
    expect(held.ok).toBe(true)
    const page = await read(h)
    expect(page.body.bands[0].soldOut).toBe(true)
  })

  it('does not show an unknown performance', async () => {
    const page = await req('GET', '/api/box-office/book/performances/perf_nothing', undefined, null)
    expect(page.status).toBe(404)
  })
})
