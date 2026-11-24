// Money going out (Invoices and exports, part 4, P-A1): a payment recorded against an owner's record
// posts one transfer with the purpose disbursement, the owner's entries and the method's account;
// bank details are sealed, shown masked, read in full only under payee.read with an audit entry.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { ensureSystemAccounts } from '#modules/finance'
import { recordDisbursement, reverseDisbursement, disbursementsOf, savePayee } from '../../server/services'
import mineGet from '../../server/api/payments/payees/mine.get'
import minePut from '../../server/api/payments/payees/mine.put'
import mineDelete from '../../server/api/payments/payees/mine.delete'
import detailsGet from '../../server/api/payments/payees/[id]/details.get'
import reverseRoute from '../../server/api/payments/disbursements/[id]/reverse.post'
import bankCount from '../../server/contributions/core.count/bank-details'
import prunePayees from '../../server/tasks/prune-payees'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const DAY = 86_400_000

const handle = server({
  'GET /api/payments/payees/mine': mineGet,
  'PUT /api/payments/payees/mine': minePut,
  'DELETE /api/payments/payees/mine': mineDelete,
  'GET /api/payments/payees/:id/details': detailsGet,
  'POST /api/payments/disbursements/:id/reverse': reverseRoute,
})

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>, actor = person([])): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  }, actor)
}

async function bill(amount: number): Promise<string> {
  const id = newId('sns')
  await env.DB.prepare("INSERT INTO snacks_sales (id, amount_minor, state) VALUES (?, ?, 'owed')").bind(id, amount).run()
  return id
}

const balance = async (key: string) => (await rows<{ n: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS n FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ?', key))[0]!.n

beforeAll(async () => {
  setClock(NOV_24)
  for (const id of ['finance', 'payments', 'snacks']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  for (const m of ['payments', 'snacks']) await commit(unit => ensureSystemAccounts(unit.view(), m))
})

describe('recording a payment made', () => {
  it('marks the owner\'s record paid and posts one transfer: the payable debited, the bank credited', async () => {
    const record = await bill(4250)
    const id = await commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record }, amountMinor: 4250, method: 'bank-transfer', paidOn: '2026-11-23', reference: 'CLAIM 12' }))
    expect((await rows<{ state: string }>('SELECT state FROM snacks_sales WHERE id = ?', record))[0]!.state).toBe('paid')
    const [row] = await rows<{ posting_id: string, paid_on: string, reference: string }>('SELECT posting_id, paid_on, reference FROM payments_disbursements WHERE id = ?', id)
    expect(row).toMatchObject({ paid_on: '2026-11-23', reference: 'CLAIM 12' })
    const [posting] = await rows<{ kind: string, purpose: string, source_module: string }>('SELECT kind, purpose, source_module FROM finance_postings WHERE id = ?', row!.posting_id)
    expect(posting).toEqual({ kind: 'transfer', purpose: 'disbursement', source_module: 'payments' })
    expect(await balance('snacks.payable')).toBe(4250)
    expect(await balance('payments.bank')).toBe(-4250)
  })

  it('pays from the account the method draws on: petty cash from cash, the parent body from what it holds', async () => {
    const a = await bill(300)
    const b = await bill(700)
    await commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record: a }, amountMinor: 300, method: 'petty-cash', paidOn: '2026-11-24' }))
    await commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record: b }, amountMinor: 700, method: 'parent-body', paidOn: '2026-11-24' }))
    expect(await balance('payments.cash')).toBe(-300)
    expect(await balance('payments.parent-body')).toBe(-700)
  })

  it('writes nothing when the owner refuses, or the date is in the future, or the amount is nothing', async () => {
    const record = await bill(500)
    const before = await rows('SELECT id FROM payments_disbursements')
    await expect(commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record }, amountMinor: 400, method: 'cheque', paidOn: '2026-11-24' }))).rejects.toMatchObject({ code: 'snacks.bill.not-owed' })
    await expect(commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record }, amountMinor: 500, method: 'cheque', paidOn: '2026-11-25' }))).rejects.toMatchObject({ code: 'payments.disbursement.future' })
    await expect(commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record }, amountMinor: 0, method: 'cheque', paidOn: '2026-11-24' }))).rejects.toMatchObject({ code: 'payments.disbursement.amount' })
    await expect(commit(unit => recordDisbursement(unit.view(), { owner: { module: 'tickets', record }, amountMinor: 500, method: 'cheque', paidOn: '2026-11-24' }))).rejects.toMatchObject({ code: 'payments.disbursement.no-owner' })
    expect(await rows('SELECT id FROM payments_disbursements')).toEqual(before)
    expect((await rows<{ state: string }>('SELECT state FROM snacks_sales WHERE id = ?', record))[0]!.state).toBe('owed')
  })

  it('is never changed after the fact', async () => {
    await expect(env.DB.prepare("UPDATE payments_disbursements SET amount_minor = 1 WHERE method = 'bank-transfer'").run()).rejects.toThrow(/append-only/)
    await expect(env.DB.prepare('DELETE FROM payments_disbursements').run()).rejects.toThrow(/append-only/)
  })
})

describe('reversing a payment recorded by mistake', () => {
  it('adds a reversal, reverses the posting and marks the owner\'s record owed again, once only', async () => {
    const record = await bill(900)
    const id = await commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record }, amountMinor: 900, method: 'cheque', paidOn: '2026-11-24' }))
    const bank = await balance('payments.bank')
    const res = await call(handle, 'POST', `/api/payments/disbursements/${id}/reverse`, { actor: person(['payments.disbursement.record'], { reassertedAt: NOV_24 }), headers: { 'idempotency-key': `rev-${id}` } })
    expect(res.status).toBe(200)
    expect((await rows<{ state: string }>('SELECT state FROM snacks_sales WHERE id = ?', record))[0]!.state).toBe('owed')
    expect(await balance('payments.bank')).toBe(bank + 900)
    const [reversal] = await rows<{ posting_id: string }>('SELECT posting_id FROM payments_disbursements WHERE reverses_id = ?', id)
    expect((await rows<{ kind: string, purpose: string }>('SELECT kind, purpose FROM finance_postings WHERE id = ?', reversal!.posting_id))[0]).toEqual({ kind: 'correction', purpose: 'disbursement' })
    await expect(commit(unit => reverseDisbursement(unit.view(), id))).rejects.toMatchObject({ code: 'payments.disbursement.already-reversed' })
    expect(await inContext(() => disbursementsOf({ module: 'snacks', record }))).toEqual([expect.objectContaining({ id, reversed: true })])
  })

  it('needs payments.disbursement.record', async () => {
    const record = await bill(100)
    const id = await commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record }, amountMinor: 100, method: 'cheque', paidOn: '2026-11-24' }))
    const res = await call(handle, 'POST', `/api/payments/disbursements/${id}/reverse`, { actor: person([]), headers: { 'idempotency-key': `rev-${id}` } })
    expect(res.status).toBe(403)
  })
})

describe('bank details', () => {
  const me = person([])

  it('are sealed at rest and shown to their owner only masked', async () => {
    const put = await call(handle, 'PUT', '/api/payments/payees/mine', { actor: me, body: { accountName: 'Jo Bloggs', sortCode: '12-34-56', accountNumber: '1234 5678' } })
    expect(put.status).toBe(200)
    const [row] = await rows<{ account_name: string, sort_code: string, account_number: string, last_digits: string }>('SELECT account_name, sort_code, account_number, last_digits FROM payments_payees WHERE account_id = ?', me.accountId)
    expect(row!.last_digits).toBe('78')
    for (const sealed of [row!.account_name, row!.sort_code, row!.account_number]) expect(sealed).not.toMatch(/Jo Bloggs|123456|12345678/)
    const mine = await (await call(handle, 'GET', '/api/payments/payees/mine', { actor: me })).json() as { payee: Record<string, unknown> }
    expect(mine.payee).toMatchObject({ held: true, initial: 'J', lastDigits: '78' })
    expect(JSON.stringify(mine)).not.toMatch(/Bloggs|123456|12345678/)
    expect(await inContext(() => bankCount.value(me), me)).toBe(1)
  })

  it('refuse a sort code or account number of the wrong shape, field by field', async () => {
    const res = await call(handle, 'PUT', '/api/payments/payees/mine', { actor: me, body: { accountName: 'Jo', sortCode: '1234', accountNumber: '12' } })
    expect(res.status).toBe(422)
    const body = await res.json() as { data?: { fields?: Record<string, string> }, fields?: Record<string, string> }
    expect(Object.keys(body.data?.fields ?? body.fields ?? {})).toEqual(['sortCode', 'accountNumber'])
  })

  it('are read in full only under payments.payee.read, and each read is audited', async () => {
    const [row] = await rows<{ id: string }>('SELECT id FROM payments_payees WHERE account_id = ?', me.accountId)
    expect((await call(handle, 'GET', `/api/payments/payees/${row!.id}/details`, { actor: me })).status).toBe(403)
    const treasurer = person(['payments.payee.read'])
    const res = await call(handle, 'GET', `/api/payments/payees/${row!.id}/details`, { actor: treasurer })
    expect(await res.json()).toEqual({ details: { accountName: 'Jo Bloggs', sortCode: '123456', accountNumber: '12345678' } })
    const audits = await rows<{ action: string, detail: string | null }>("SELECT action, detail FROM core_audit WHERE record_id = ? AND action = 'read'", row!.id)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.detail ?? '').not.toMatch(/Bloggs|123456/)
  })

  it('are cleared by their owner, the row kept for payments already made', async () => {
    const [row] = await rows<{ id: string }>('SELECT id FROM payments_payees WHERE account_id = ?', me.accountId)
    const record = await bill(250)
    await commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record }, amountMinor: 250, method: 'bank-transfer', paidOn: '2026-11-24', payeeId: row!.id }))
    expect((await call(handle, 'DELETE', '/api/payments/payees/mine', { actor: me })).status).toBe(200)
    expect((await rows('SELECT account_name, sort_code, account_number, last_digits FROM payments_payees WHERE id = ?', row!.id))[0]).toEqual({ account_name: null, sort_code: null, account_number: null, last_digits: null })
    expect(await rows('SELECT id FROM payments_disbursements WHERE payee_id = ?', row!.id)).toHaveLength(1)
    expect(await inContext(() => bankCount.value(me), me)).toBe(0)
  })

  it('are cleared once unused for payments.payees.keep-for, counted from the last payment', async () => {
    const used = person([])
    const idle = person([])
    const usedId = await commit(unit => savePayee(unit.view(), { module: 'core', id: used.accountId! }, { accountName: 'Used', sortCode: '111111', accountNumber: '11111111' }))
    await commit(unit => savePayee(unit.view(), { module: 'core', id: idle.accountId! }, { accountName: 'Idle', sortCode: '222222', accountNumber: '22222222' }))
    setClock(NOV_24 + 700 * DAY)
    const record = await bill(10)
    await commit(unit => recordDisbursement(unit.view(), { owner: { module: 'snacks', record }, amountMinor: 10, method: 'bank-transfer', paidOn: '2028-10-24', payeeId: usedId }))
    setClock(NOV_24 + 740 * DAY)
    await commit(unit => prunePayees(unit.view(), { dueAt: nowMs() }) as Promise<void>)
    const left = await rows<{ account_id: string, last_digits: string | null }>('SELECT account_id, last_digits FROM payments_payees WHERE account_id IN (?, ?)', used.accountId, idle.accountId)
    expect(Object.fromEntries(left.map(r => [r.account_id, r.last_digits]))).toEqual({ [used.accountId!]: '11', [idle.accountId!]: null })
    setClock(NOV_24)
  })
})
