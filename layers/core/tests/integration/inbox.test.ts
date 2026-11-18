// The inbox (C-30): a person's messages on one side, newest first, with the bell's unread count;
// opening one marks it read; "Mark all read"; archiving and bringing back. Nobody reaches another
// person's message, an expired one is gone, and the members' side is not found for a non-member.
import { describe, expect, it } from 'vitest'
import listInbox from '../../server/api/core/me/inbox.get'
import unread from '../../server/api/core/me/inbox/unread.get'
import readAll from '../../server/api/core/me/inbox/read-all.post'
import read from '../../server/api/core/me/inbox/[id]/read.post'
import archive from '../../server/api/core/me/inbox/[id]/archive.post'
import { call, env, person, server } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/me/inbox': listInbox,
  'GET /api/core/me/inbox/unread': unread,
  'POST /api/core/me/inbox/read-all': readAll,
  'POST /api/core/me/inbox/:id/read': read,
  'POST /api/core/me/inbox/:id/archive': archive,
})

type Actor = ReturnType<typeof person>
async function req<T = any>(actor: Actor, method: string, path: string, body?: object): Promise<{ status: number, body: T }> {
  const r = await call(handle, method, path, { actor, body })
  return { status: r.status, body: await r.json() as T }
}
let n = 0
async function message(actor: Actor, title: string, options: { side?: 'audience' | 'members', at?: number, expired?: boolean, link?: string } = {}): Promise<string> {
  const id = `inb_${String(++n).padStart(26, '0')}`
  const at = options.at ?? Date.now()
  await env.DB.prepare('INSERT INTO core_inbox_items (id, account_id, side, title, body, link, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, actor.accountId, options.side ?? 'audience', title, `About ${title}`, options.link ?? null, options.expired ? Date.now() - 1 : Date.now() + 86_400_000, at).run()
  return id
}
const titles = (body: { items: { title: string }[] }) => body.items.map(i => i.title)

describe('the inbox', () => {
  it('lists one side\'s messages newest first, with the unread count, and leaves out expired ones', async () => {
    const reader = person([])
    await message(reader, 'Older', { at: Date.now() - 2000 })
    await message(reader, 'Newer', { at: Date.now() - 1000, link: '/account/access' })
    await message(reader, 'For members', { side: 'members' })
    await message(reader, 'Gone', { expired: true })
    const { status, body } = await req(reader, 'GET', '/api/core/me/inbox')
    expect(status).toBe(200)
    expect(titles(body)).toEqual(['Newer', 'Older'])
    expect(body).toMatchObject({ unread: 2, more: false })
    expect(body.items[0]).toMatchObject({ body: 'About Newer', link: '/account/access', read: false, archived: false })
    expect((await req(reader, 'GET', '/api/core/me/inbox/unread')).body).toEqual({ signedIn: true, audience: 2, members: 0, total: 2 })
  })

  it('marks a message read when it is opened, once, and all of them at once', async () => {
    const reader = person([])
    const first = await message(reader, 'First')
    await message(reader, 'Second')
    expect((await req(reader, 'POST', `/api/core/me/inbox/${first}/read`)).status).toBe(200)
    expect((await req(reader, 'POST', `/api/core/me/inbox/${first}/read`)).status).toBe(200)
    expect((await req(reader, 'GET', '/api/core/me/inbox')).body.unread).toBe(1)
    expect((await req(reader, 'POST', '/api/core/me/inbox/read-all', { side: 'audience' })).status).toBe(200)
    const { body } = await req(reader, 'GET', '/api/core/me/inbox')
    expect(body.unread).toBe(0)
    expect(body.items.every((i: { read: boolean }) => i.read)).toBe(true)
  })

  it('archives a message, which reads it, and brings it back', async () => {
    const reader = person([])
    const id = await message(reader, 'Keep for later')
    expect((await req(reader, 'POST', `/api/core/me/inbox/${id}/archive`, {})).body).toEqual({ id, archived: true })
    expect(titles((await req(reader, 'GET', '/api/core/me/inbox')).body)).toEqual([])
    const archived = (await req(reader, 'GET', '/api/core/me/inbox?archived=1')).body
    expect(archived.items).toMatchObject([{ title: 'Keep for later', read: true, archived: true }])
    await req(reader, 'POST', `/api/core/me/inbox/${id}/archive`, { archived: false })
    expect(titles((await req(reader, 'GET', '/api/core/me/inbox')).body)).toEqual(['Keep for later'])
  })

  it('pages through a long inbox', async () => {
    const reader = person([])
    for (let i = 0; i < 27; i++) await message(reader, `Message ${i}`, { at: 1_000_000 + i })
    const first = (await req(reader, 'GET', '/api/core/me/inbox')).body
    expect(first.items).toHaveLength(25)
    expect(first.more).toBe(true)
    const next = (await req(reader, 'GET', `/api/core/me/inbox?before=${first.items.at(-1).id}`)).body
    expect(titles(next)).toEqual(['Message 1', 'Message 0'])
    expect(next.more).toBe(false)
  })

  it('never reaches someone else\'s message, nor an expired one', async () => {
    const owner = person([])
    const other = person([])
    const id = await message(owner, 'Private')
    const gone = await message(owner, 'Expired', { expired: true })
    expect((await req(other, 'POST', `/api/core/me/inbox/${id}/read`)).status).toBe(404)
    expect((await req(other, 'POST', `/api/core/me/inbox/${id}/archive`, {})).status).toBe(404)
    expect((await req(owner, 'POST', `/api/core/me/inbox/${gone}/read`)).status).toBe(404)
    expect((await req(owner, 'GET', '/api/core/me/inbox')).body.items[0]).toMatchObject({ title: 'Private', read: false })
  })

  it('answers "not found" for the members\' side to someone who is not a member', async () => {
    const reader = person([])
    await message(reader, 'Members only', { side: 'members' })
    expect((await req(reader, 'GET', '/api/core/me/inbox?side=members')).status).toBe(404)
    // The one inbox shows such a person only the audience side.
    await message(reader, 'Booking')
    expect(titles((await req(reader, 'GET', '/api/core/me/inbox?side=all')).body)).toEqual(['Booking'])
  })
})
