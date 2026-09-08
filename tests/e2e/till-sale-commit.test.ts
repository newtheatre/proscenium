import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-105 through the real route: a matched total writes the ledger entry, one line per basket
// line and one stock movement per resolved ingredient in a single atomic commit.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember
const barPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  barManager = await registerMember(app, 'commit-bar', barPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`

const created = async (answered: Response): Promise<string> => {
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}

function programme(suffix: string): { venueId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix })
    return { venueId: made.venueId }
  }
  finally {
    database.close()
  }
}

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const openTill = (venueId: string): Promise<Response> => send('POST', '/api/till', { venueId }, barManager.cookie)
const aCategory = async (): Promise<string> => created(await send('POST', '/api/admin/bar/categories', { name: named('Spirits') }))

const aProductIn = async (categoryId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId, ...over }))

const activate = (productId: string): Promise<Response> =>
  send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })

const addVariant = async (productId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single', ...over }))

const priceVariant = (variantId: string, pricePence: number): Promise<Response> =>
  send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today() })

const anItem = async (over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/items', { name: named('Tonic'), unit: 'ML', containerMl: 1000, ...over }))

const deliver = (itemId: string, qty: number): Promise<Response> =>
  send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty, unitCostPence: 100 })

const charge = (venueId: string, lines: unknown[], expectedTotalPence: number, as = barManager.cookie): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines, expectedTotalPence }, as)

interface Counts { entries: number, lines: number, movements: number, audits: number }

function counts(): Counts {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const one = (table: string): number => (database.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
    return {
      entries: one('ledger_entries'),
      lines: one('ledger_lines'),
      movements: one('stock_movements'),
      audits: (database.query(`SELECT count(*) AS n FROM audit_log WHERE action = 'bar.till.sale'`).get() as { n: number }).n,
    }
  }
  finally {
    database.close()
  }
}

interface LedgerLineRow {
  id: string
  kind: string
  amount_pence: number
  qty: number
  unit_price_pence: number
  product_variant_id: string
  price_ref: string
  choices: string | null
}

function ledgerLinesFor(entryId: string): LedgerLineRow[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT * FROM ledger_lines WHERE entry_id = ? ORDER BY rowid').all(entryId) as LedgerLineRow[]
  }
  finally {
    database.close()
  }
}

interface MovementRow {
  id: string
  item_id: string
  qty: number
  kind: string
  ref_table: string | null
  ref_id: string | null
  actor_id: string | null
}

function movementsFor(refId: string): MovementRow[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(`SELECT * FROM stock_movements WHERE ref_table = 'ledger_lines' AND ref_id = ?`).all(refId) as MovementRow[]
  }
  finally {
    database.close()
  }
}

function ledgerEntry(entryId: string): { source: string, tender: string, actor_id: string, total_pence: number } | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT source, tender, actor_id, total_pence FROM ledger_entries WHERE id = ?').get(entryId) as never
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a matched sale writes the ledger entry and its lines (F-105 criterion 1)', () => {
  test('one entry, one line, priced and attributed to the seller and the source', async () => {
    const { venueId } = programme('commit-basic')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)
    await priceVariant(variantId, 250)
    await activate(productId)
    await openTill(venueId)

    const answered = await charge(venueId, [{ variantId, qty: 2 }], 500)
    expect(answered.status).toBe(200)
    const { entryId } = await answered.json() as { entryId: string }

    const entry = ledgerEntry(entryId)
    expect(entry).toMatchObject({ source: 'TILL', tender: 'CARD', actor_id: barManager.id, total_pence: 500 })

    const lines = ledgerLinesFor(entryId)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      kind: 'BAR_ITEM', amount_pence: 500, qty: 2, unit_price_pence: 250, product_variant_id: variantId,
    })
    expect(lines[0]!.price_ref).toMatch(/^variant:[a-f0-9]+$/)
    expect(lines[0]!.choices).toBeNull()
  })

  test('several lines in one basket each become their own line', async () => {
    const { venueId } = programme('commit-multi')
    const categoryId = await aCategory()
    const first = await aProductIn(categoryId)
    const firstVariant = await addVariant(first)
    await priceVariant(firstVariant, 250)
    await activate(first)
    const second = await aProductIn(categoryId)
    const secondVariant = await addVariant(second)
    await priceVariant(secondVariant, 400)
    await activate(second)
    await openTill(venueId)

    const answered = await charge(venueId, [
      { variantId: firstVariant, qty: 1 },
      { variantId: secondVariant, qty: 2 },
    ], 250 + 400 * 2)
    expect(answered.status).toBe(200)
    const { entryId } = await answered.json() as { entryId: string }

    const lines = ledgerLinesFor(entryId)
    expect(lines).toHaveLength(2)
    expect(lines.map(line => line.product_variant_id).sort()).toEqual([firstVariant, secondVariant].sort())
  })
})

describe.skipIf(skip !== null)('a matched sale depletes stock, one movement per ingredient (F-105 criteria 1, 3)', () => {
  test('a direct recipe depletes at the recipe\'s own quantity times the line quantity', async () => {
    const { venueId } = programme('commit-recipe')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)
    await priceVariant(variantId, 250)
    const itemId = await anItem({ name: named('Gin bottle') })
    await deliver(itemId, 1000)
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 25 }] })
    await activate(productId)
    await openTill(venueId)

    const answered = await charge(venueId, [{ variantId, qty: 3 }], 750)
    expect(answered.status).toBe(200)
    const { entryId } = await answered.json() as { entryId: string }
    const [line] = ledgerLinesFor(entryId)

    const movements = movementsFor(line!.id)
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({ item_id: itemId, qty: -75, kind: 'SALE', actor_id: barManager.id })
  })

  test('a choice depletes the chosen option, at the option\'s own quantity, and nothing else offered', async () => {
    const { venueId } = programme('commit-choice')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId, { servingKind: 'double', label: 'Double' })
    await priceVariant(variantId, 450)
    const tonic = await anItem({ name: named('Tonic') })
    const lemonade = await anItem({ name: named('Lemonade') })
    await deliver(tonic, 1000)
    await deliver(lemonade, 1000)
    const groupId = await created(await send('POST', '/api/admin/bar/choice-groups', {
      name: named('Mixers'),
      options: [{ itemId: tonic, qty: 100 }, { itemId: lemonade, qty: 150 }],
    }))
    await send('PUT', `/api/admin/bar/variants/${variantId}/choice`, { choiceGroupId: groupId, qty: 1, includedInPrice: true })
    await activate(productId)
    await openTill(venueId)

    const catalogue = await send('GET', `/api/till/products?venueId=${venueId}`, undefined, barManager.cookie)
    const body = await catalogue.json() as { products: { id: string, variants: { id: string, choice: { options: { id: string, itemName: string }[] } | null }[] }[] }
    const variant = body.products.find(product => product.id === productId)!.variants.find(entry => entry.id === variantId)!
    const chosen = variant.choice!.options.find(option => option.itemName.includes('Lemonade'))!

    const answered = await charge(venueId, [{ variantId, qty: 2, choiceItemId: chosen.id }], 900)
    expect(answered.status).toBe(200)
    const { entryId } = await answered.json() as { entryId: string }
    const [line] = ledgerLinesFor(entryId)
    expect(JSON.parse(line!.choices ?? '{}')).toMatchObject({ choiceItemId: chosen.id })

    const movements = movementsFor(line!.id)
    expect(movements).toHaveLength(1)
    // 150 per double, times a basket quantity of 2: the chosen option alone, not the untouched one.
    expect(movements[0]).toMatchObject({ item_id: lemonade, qty: -300 })
  })
})

describe.skipIf(skip !== null)('an oversized sale is refused, and nothing is written (F-105 criteria 2, 5)', () => {
  test('the refusal is clean, and the ledger, its lines, stock and the audit trail are all untouched', async () => {
    const { venueId } = programme('commit-oversell')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)
    await priceVariant(variantId, 250)
    const itemId = await anItem({ name: named('Scarce gin') })
    await deliver(itemId, 25)
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 25 }] })
    await activate(productId)
    await openTill(venueId)

    const before = counts()
    const answered = await charge(venueId, [{ variantId, qty: 2 }], 500)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('Not enough left in stock')
    expect(counts()).toEqual(before)
  })
})

describe.skipIf(skip !== null)('the sale is attributed to the session, and audited (F-105 criterion 4)', () => {
  test('one audit row per sale, naming the venue, the night and the session', async () => {
    const { venueId } = programme('commit-audit')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)
    await priceVariant(variantId, 250)
    await activate(productId)
    const opened = await openTill(venueId)
    const { session } = await opened.json() as { session: { id: string } }

    const before = counts()
    await charge(venueId, [{ variantId, qty: 1 }], 250)
    expect(counts().audits).toBe(before.audits + 1)

    const database = new Database(app.databaseFile, { readonly: true })
    try {
      const row = database.query(`SELECT target, detail FROM audit_log WHERE action = 'bar.till.sale' AND target = ?`)
        .get(`till-session:${session.id}`) as { target: string, detail: string } | null
      expect(row).not.toBeNull()
      expect(JSON.parse(row!.detail)).toMatchObject({ venueId })
    }
    finally {
      database.close()
    }
  })
})

describe.skipIf(skip !== null)('a sold variant reads as sold, everywhere that guard reads it (F-105\'s VARIANT_REFERENCES entry)', () => {
  test('a sold variant can no longer be deleted', async () => {
    const { venueId } = programme('commit-eversold')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)
    await priceVariant(variantId, 250)
    await activate(productId)
    await openTill(venueId)

    expect((await charge(venueId, [{ variantId, qty: 1 }], 250)).status).toBe(200)

    const refused = await send('DELETE', `/api/admin/bar/variants/${variantId}`)
    expect(refused.status).toBe(409)
    expect(await message(refused)).toContain('has been sold')
  })
})
