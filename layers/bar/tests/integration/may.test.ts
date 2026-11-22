// What the viewer may do in the bar: Stock's tabs show only what a person may open, and Outlets
// shows the price lists to whoever may change prices. An ability held but needing a fresh sign-in
// still counts, as it does for the menu.
import { beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { call, person, server, setModule } from '../../../../tests/integration/helpers'
import mayGet from '../../server/api/bar/may.get'

const NOW = Date.UTC(2026, 10, 21, 12) // not-policy: a test's moment
const handle = server({ 'GET /api/bar/may': mayGet })
const may = async (actor?: ReturnType<typeof person>) => {
  const response = await call(handle, 'GET', '/api/bar/may', { actor })
  return { status: response.status, body: await response.json() as any }
}

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
})

describe('what the viewer may do in the bar', () => {
  it('needs a sign-in', async () => {
    expect((await may()).status).toBe(401)
  })

  it('gives a counter the levels and the counts, and no set-up', async () => {
    expect((await may(person(['bar.stock.count']))).body).toEqual({
      stock: { levels: true, deliveries: false, counts: true },
      setup: { outlets: false, prices: false },
    })
  })

  it('gives someone who receives stock the deliveries, and someone with nothing no tab', async () => {
    expect((await may(person(['bar.stock.receive']))).body.stock).toEqual({ levels: true, deliveries: true, counts: false })
    expect((await may(person(['bar.sale.sell']))).body.stock).toEqual({ levels: false, deliveries: false, counts: false })
  })

  it('counts a privileged ability as held before the fresh sign-in it needs', async () => {
    expect((await may(person(['bar.price.manage']))).body.setup).toEqual({ outlets: false, prices: true })
    expect((await may(person(['bar.outlet.manage', 'bar.price.manage'], { reassertedAt: NOW }))).body.setup).toEqual({ outlets: true, prices: true })
  })
})
