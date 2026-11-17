// Importing members from a file (MEM-49): a dry run reports what would import and every refused row
// with its line; the import runs as bulk jobs that find or create each account and write active
// memberships with the file's dates or the scheme's rule; a row for the importer's own account, or
// for somebody already holding the scheme, is refused; and it needs membership.membership.import.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { call, deliver, person, rows, server } from '../../../../tests/integration/helpers'
import importPost from '../../server/api/membership/schemes/[id]/import.post'
import { NOV_17, applicant, ready, req, scheme } from './stage'

const handle = server({ 'POST /api/membership/schemes/:id/import': importPost })
const importer = person(['membership.membership.import'], { reassertedAt: NOV_17 })
async function send(schemeId: string, file: string, dryRun: boolean, actor = importer) {
  const response = await call(handle, 'POST', `/api/membership/schemes/${schemeId}/import`, { actor, body: { file, dryRun }, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}

beforeAll(ready)

describe('importing members', () => {
  it('tries the file first, then imports it in the background', async () => {
    const id = await scheme()
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
    await rows('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'self\', ?) RETURNING id', newId('aem'), importer.accountId, 'importer@example.org', NOV_17, NOV_17).catch(() => [])
    const existing = await applicant('Existing Person', 'existing@example.org')
    const holder = await applicant('Already Holds', 'holder@example.org')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, holder)).status).toBe(200)

    const file = [
      'Email,Name,Start,End',
      'new.member@example.org,New Member,01/09/2026,31/08/2027',
      'EXISTING@example.org,,,',
      'not an address,Somebody,,',
      'dates@example.org,Wrong Way,2027-01-01,2026-01-01',
      'new.member@example.org,Twice,,',
      'holder@example.org,Already Holds,,',
      'bad.date@example.org,Bad Date,32/13/2026,',
    ].join('\n')
    const tried = await send(id, file, true)
    expect(tried.status, JSON.stringify(tried.body)).toBe(200)
    expect(tried.body, JSON.stringify(tried.body)).toMatchObject({ queued: 0, wouldImport: 2 })
    expect(tried.body.refused).toEqual([
      { line: 4, reason: 'not-an-address' },
      { line: 5, reason: 'dates' },
      { line: 6, reason: 'repeated' },
      { line: 7, reason: 'already-held' },
      { line: 8, reason: 'bad-date' },
    ])
    expect(await rows('SELECT 1 FROM core_account_emails WHERE address = ?', 'new.member@example.org')).toEqual([])
    expect((await send(id, file, true, person([]))).status).toBe(403)

    const done = await send(id, file, false)
    expect(done.body).toMatchObject({ queued: 2 })
    await deliver()
    const imported = await rows<{ address: string, state: string, starts_on: string, ends_on: string, origin: string }>(
      'SELECT e.address, m.state, m.starts_on, m.ends_on, m.origin FROM membership_memberships m JOIN core_account_emails e ON e.account_id = m.account_id WHERE m.scheme_id = ? AND e.address IN (?, ?) ORDER BY e.address', id, 'existing@example.org', 'new.member@example.org')
    expect(imported).toEqual([
      { address: 'existing@example.org', state: 'active', starts_on: '2026-11-17', ends_on: '2027-11-16', origin: 'added' },
      { address: 'new.member@example.org', state: 'active', starts_on: '2026-09-01', ends_on: '2027-08-31', origin: 'added' },
    ])
    expect(await rows('SELECT count(*) AS n FROM membership_memberships WHERE account_id = ? AND scheme_id = ?', existing.accountId, id)).toEqual([{ n: 1 }])

    // Run again, nothing new is written: every row is now held.
    const again = await send(id, file, true)
    expect(again.body.wouldImport).toBe(0)
  })

  it('refuses a row for the importer\'s own account', async () => {
    const id = await scheme()
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
    const self = await applicant('Self Importer', 'self.importer@example.org')
    const own = { ...person(['membership.membership.import'], { reassertedAt: NOV_17 }), accountId: self.accountId }
    const tried = await send(id, 'self.importer@example.org,Me,,\nother.person@example.org,Other,,', true, own)
    expect(tried.body).toMatchObject({ wouldImport: 1, refused: [{ line: 1, reason: 'own-account' }] })
  })
})
