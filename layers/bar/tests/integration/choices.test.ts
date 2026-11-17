// Choices on a product (tab 10, approved 17 November): shared groups attached to products, mixers
// drawn from every product that can be used as one, picks priced into the line, a restricted pick
// asking the age check, and the picks kept with the sale line.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { openSession } from '../../../payments/server/services'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import tillSalePost from '../../../payments/server/api/payments/till/sale.post'
import menuGet from '../../server/api/bar/till/menu.get'
import standardListener from '../../server/listeners/standard-price-list'
import { addCategory, addOutlet, addPriceList, addProduct, addVariant } from '../../server/catalogue'
import { addGroup, addOption, setMixer, setProductGroups, updateGroup } from '../../server/choices'
import { lessPercent } from '../../server/pricing'

const NOW = Date.UTC(2026, 10, 17, 22) // not-policy: a test's moment
const handle = server({ 'POST /api/payments/till/sale': tillSalePost, 'GET /api/bar/till/menu': menuGet })
const seller = person(['payments.session.open', 'bar.sale.sell'], { reassertedAt: NOW })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T> | T): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
async function send(method: string, path: string, body?: unknown) {
  const response = await call(handle, method, path, { actor: seller, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}

const s = { outlet: '', committee: '', single: '', double: '', cola: '', colaMix: '', tonicMix: '', hotChoc: '', softCat: '', hotCat: '', colaProduct: '', tonicProduct: '', chocProduct: '', smProduct: '', spirit: '', mixer: '', shot: '', gin: '', hendricks: '', whisky: '' }
type Line = { variantId: string, quantity: number, choices?: { groupId: string, key: string }[] }
const sell = (key: string, lines: Line[], total: number, extra: Record<string, unknown> = {}) =>
  send('POST', '/api/payments/till/sale', { panels: [{ basket: 'bar', input: { outletId: s.outlet, clientKey: key, lines, expectedTotalMinor: total, ...extra } }] })
const linesOf = (key: string) => rows<{ unit_minor: number, quantity: number, picks: string | null }>(
  `SELECT l.unit_minor, l.quantity, (SELECT group_concat(c.label, ', ') FROM bar_sale_line_choices c WHERE c.sale_line_id = l.id) AS picks
     FROM bar_sale_lines l JOIN bar_sales x ON x.id = l.sale_id WHERE x.client_key = ? ORDER BY l.unit_minor, picks`, key)

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await commit(unit => standardListener({ payload: { moduleId: 'bar' } } as any, unit.view()))
  await commit(async (unit) => {
    const v = unit.view()
    const spirits = addCategory(v, { name: 'Choices spirits' })
    const soft = addCategory(v, { name: 'Choices soft' })
    const hot = addCategory(v, { name: 'Choices hot' })
    const sm = await addProduct(v, { categoryId: spirits, name: 'Spirit and mixer', ageRestricted: true }, { name: 'Single', amountMinor: 450 }, seller.accountId!)
    s.single = sm.variantId
    s.double = await addVariant(v, sm.productId, { name: 'Double' }, 650, seller.accountId!)
    s.smProduct = sm.productId
    s.softCat = soft
    s.hotCat = hot
  })
  await commit(async (unit) => {
    const v = unit.view()
    const soft = s.softCat
    const hot = s.hotCat
    const cola = await addProduct(v, { categoryId: soft, name: 'Choices cola' }, { amountMinor: 200 }, seller.accountId!)
    s.cola = cola.variantId
    const tonic = await addProduct(v, { categoryId: soft, name: 'Choices tonic' }, { amountMinor: 180 }, seller.accountId!)
    const choc = await addProduct(v, { categoryId: hot, name: 'Hot chocolate' }, { amountMinor: 250 }, seller.accountId!)
    s.hotChoc = choc.variantId
    s.colaProduct = cola.productId
    s.tonicProduct = tonic.productId
    s.chocProduct = choc.productId
  })
  await commit(async (unit) => {
    const v = unit.view()
    await setMixer(v, s.colaProduct, true)
    await setMixer(v, s.tonicProduct, true)
    s.spirit = addGroup(v, { name: 'Choices spirit', source: 'options' })
    s.gin = addOption(v, s.spirit, { name: 'House gin' })
    s.hendricks = addOption(v, s.spirit, { name: "Hendrick's", deltaMinor: 100 })
    s.mixer = addGroup(v, { name: 'Choices mixer', source: 'mixers', mixerPricing: 'included' })
    s.shot = addGroup(v, { name: 'Choices shot', source: 'options', required: false })
    s.whisky = addOption(v, s.shot, { name: 'Whisky', deltaMinor: 200, ageRestricted: true })
    setProductGroups(v, s.smProduct, [s.spirit, s.mixer])
    setProductGroups(v, s.chocProduct, [s.shot])
    s.outlet = addOutlet(v, { name: 'Choices bar', kind: 'bar' })
    s.committee = addPriceList(v, { name: 'Choices committee', percentOff: 25, restricted: true })
  })
  const mixers = await rows<{ id: string, product: string }>("SELECT v.id, p.name AS product FROM bar_variants v JOIN bar_products p ON p.id = v.product_id WHERE v.mixer_measure = 1 AND p.name LIKE 'Choices %'")
  s.colaMix = mixers.find(m => m.product === 'Choices cola')!.id
  s.tonicMix = mixers.find(m => m.product === 'Choices tonic')!.id
  await commit(async (unit) => {
    await updateGroup(unit.view(), s.spirit, { defaultKey: s.gin })
    await updateGroup(unit.view(), s.mixer, { defaultKey: s.tonicMix })
  })
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone' as never, 'Europe/London', { reason: 'test', confirm: true }))
  await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Bar', floatMinor: 0 }))
})

describe('the menu', () => {
  it('lists the groups with their options, attaches them to items, and keeps mixer measures off the grid', async () => {
    const menu = (await send('GET', `/api/bar/till/menu?outlet=${s.outlet}`)).body
    const items = menu.categories.flatMap((c: any) => c.items)
    expect(items.filter((i: any) => i.product === 'Choices cola').map((i: any) => i.variant)).toEqual(['Each'])
    expect(items.find((i: any) => i.variantId === s.double)).toMatchObject({ groupIds: [s.spirit, s.mixer], baseMinor: 650 })
    const mixer = menu.groups.find((g: any) => g.id === s.mixer)
    expect(mixer.options.map((o: any) => o.label)).toEqual(['Choices cola', 'Choices tonic'])
    expect(mixer).toMatchObject({ defaultKey: s.tonicMix, required: true })
    expect(menu.groups.find((g: any) => g.id === s.spirit).options).toMatchObject([{ key: s.gin, deltaMinor: 0 }, { key: s.hendricks, deltaMinor: 100 }])
    expect(menu.ageCheck).toMatchObject({ idTypes: ['passport', 'driving_licence', 'pass_card', 'other_photo'], refusalScope: true })
  })
})

describe('selling with choices', () => {
  it('prices the picks into the line, and different picks make different lines', async () => {
    const sold = await sell('choice-1-xxxxxxx', [
      { variantId: s.double, quantity: 1, choices: [{ groupId: s.spirit, key: s.hendricks }, { groupId: s.mixer, key: s.colaMix }] },
      { variantId: s.double, quantity: 1, choices: [{ groupId: s.spirit, key: s.hendricks }, { groupId: s.mixer, key: s.tonicMix }] },
      { variantId: s.double, quantity: 1, choices: [{ groupId: s.mixer, key: s.colaMix }, { groupId: s.spirit, key: s.hendricks }] },
    ], 2250, { ageCheck: 'id_checked', idType: 'driving_licence' })
    expect(sold.status, JSON.stringify(sold.body)).toBe(200)
    expect(await linesOf('choice-1-xxxxxxx')).toEqual([
      { unit_minor: 750, quantity: 2, picks: "Hendrick's, Choices cola" },
      { unit_minor: 750, quantity: 1, picks: "Hendrick's, Choices tonic" },
    ])
    expect(await rows("SELECT a.outcome, a.id_type FROM bar_age_checks a JOIN bar_sales x ON x.id = a.sale_id WHERE x.client_key = 'choice-1-xxxxxxx'")).toEqual([{ outcome: 'id_checked', id_type: 'driving_licence' }])
  })

  it('takes the usual pick for a required choice left unmade, and refuses one with no usual pick', async () => {
    const sold = await sell('choice-2-xxxxxxx', [{ variantId: s.single, quantity: 1 }], 450, { ageCheck: 'not_needed' })
    expect(sold.status, JSON.stringify(sold.body)).toBe(200)
    expect(await linesOf('choice-2-xxxxxxx')).toEqual([{ unit_minor: 450, quantity: 1, picks: 'House gin, Choices tonic' }])

    await commit(unit => updateGroup(unit.view(), s.mixer, { defaultKey: null }))
    expect((await sell('choice-3-xxxxxxx', [{ variantId: s.single, quantity: 1 }], 450, { ageCheck: 'not_needed' })).body.code).toBe('bar.choice.missing')
    await commit(unit => updateGroup(unit.view(), s.mixer, { defaultKey: s.tonicMix }))
  })

  it('refuses a pick the product does not take, or one that is not offered', async () => {
    expect((await sell('choice-4-xxxxxxx', [{ variantId: s.cola, quantity: 1, choices: [{ groupId: s.shot, key: s.whisky }] }], 400)).body.code).toBe('bar.choice.not-here')
    expect((await sell('choice-5-xxxxxxx', [{ variantId: s.single, quantity: 1, choices: [{ groupId: s.mixer, key: s.cola }] }], 450, { ageCheck: 'not_needed' })).body.code).toBe('bar.choice.gone')
  })

  it('asks the age check when a pick needs it, though the product does not', async () => {
    expect((await sell('choice-6-xxxxxxx', [{ variantId: s.hotChoc, quantity: 1 }], 250)).status).toBe(200)
    const shot = [{ variantId: s.hotChoc, quantity: 1, choices: [{ groupId: s.shot, key: s.whisky }] }]
    expect((await sell('choice-7-xxxxxxx', shot, 450)).body.code).toBe('bar.age-check.unanswered')
    expect((await sell('choice-7-xxxxxxx', shot, 450, { ageCheck: 'not_needed' })).status).toBe(200)
  })

  it('rounds once on a percentage list, on the size and its picks together', async () => {
    await commit(unit => unit.add({ sql: 'UPDATE bar_outlets SET price_list_id = ? WHERE id = ?', params: [s.committee, s.outlet] }))
    const unitMinor = lessPercent(450 + 100, 25)
    const sold = await sell('choice-8-xxxxxxx', [{ variantId: s.single, quantity: 1, choices: [{ groupId: s.spirit, key: s.hendricks }] }], unitMinor, { ageCheck: 'not_needed' })
    expect(sold.status, JSON.stringify(sold.body)).toBe(200)
    expect((await linesOf('choice-8-xxxxxxx'))[0]!.unit_minor).toBe(unitMinor)
    const menu = (await send('GET', `/api/bar/till/menu?outlet=${s.outlet}`)).body
    expect(menu.percentOff).toBe(25)
    expect(menu.categories.flatMap((c: any) => c.items).find((i: any) => i.variantId === s.single).baseMinor).toBe(450)
  })
})
