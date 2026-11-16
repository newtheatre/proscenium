import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'
import { unitOfWork } from '../../layers/core/kit/unit'

const returnItem = (id: string) => unitOfWork(env.DB)
  .add("UPDATE lost_property_items SET state = 'returned' WHERE id = ? AND state = 'held'", id).expect(1)
  .audit('lost-property.item.return', id).commit()

it('returns an item once, and a second return writes nothing at all', async () => {
  await env.DB.prepare("INSERT INTO lost_property_items (id, state, description) VALUES ('a', 'held', 'umbrella')").run()
  expect((await returnItem('a')).ok).toBe(true)
  const second = await returnItem('a')
  expect(second.ok).toBe(false)
  const audit = await env.DB.prepare('SELECT count(*) AS n FROM core_audit').first<{ n: number }>()
  expect(audit!.n).toBe(1)
})

it('two people returning the same item at once: exactly one succeeds', async () => {
  await env.DB.prepare("INSERT INTO lost_property_items (id, state, description) VALUES ('b', 'held', 'scarf')").run()
  const results = await Promise.all([returnItem('b'), returnItem('b'), returnItem('b'), returnItem('b')])
  expect(results.filter(r => r.ok).length).toBe(1)
})

it('the last seat sells once under 20 concurrent purchases', async () => {
  await env.DB.prepare("INSERT INTO box_office_performances (id, capacity, sold) VALUES ('p', 5, 4)").run()
  const buy = () => unitOfWork(env.DB).add("UPDATE box_office_performances SET sold = sold + 1 WHERE id = 'p'").audit('box-office.order.sell', 'p').commit()
  const results = await Promise.all(Array.from({ length: 20 }, buy))
  expect(results.filter(r => r.ok).length).toBe(1)
  const row = await env.DB.prepare("SELECT sold FROM box_office_performances WHERE id = 'p'").first<{ sold: number }>()
  expect(row!.sold).toBe(5)
})

it('an append-only table refuses edits and deletes, but allows erasure to the erased value', async () => {
  await env.DB.prepare("INSERT INTO core_audit (action, record, actor_name) VALUES ('x', 'y', 'Real Name')").run()
  await expect(env.DB.prepare("UPDATE core_audit SET action = 'forged'").run()).rejects.toThrow(/append-only/)
  await expect(env.DB.prepare('DELETE FROM core_audit').run()).rejects.toThrow(/append-only/)
  await expect(env.DB.prepare("UPDATE core_audit SET actor_name = 'Someone Else'").run()).rejects.toThrow(/append-only/)
  await env.DB.prepare("UPDATE core_audit SET actor_name = 'Former member'").run()
  const row = await env.DB.prepare("SELECT actor_name FROM core_audit WHERE action = 'x'").first<{ actor_name: string }>()
  expect(row!.actor_name).toBe('Former member')
})
