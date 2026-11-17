// Importing past awards from a file: a dry run reports what would import and every refused row with
// its line; the import runs as bulk jobs that record each award by name, or find or create the
// account an address belongs to; a row already recorded, or for the importer's own account, is
// refused; a second run of the same file adds nothing; and it needs awards.award.issue.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { call, deliver, person, rows, server } from '../../../../tests/integration/helpers'
import importPost from '../../server/api/awards/types/[id]/import.post'
import { dateOf, table } from '../../server/importing'
import { awardType, holder, issue, NOV_17, ready, secretary } from './stage'

const handle = server({ 'POST /api/awards/types/:id/import': importPost })
async function send(typeId: string, file: string, dryRun: boolean, actor = secretary) {
  const response = await call(handle, 'POST', `/api/awards/types/${typeId}/import`, { actor, body: { file, dryRun }, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}

beforeAll(ready)

describe('reading a file', () => {
  it('reads dates, years and quoted cells that hold commas and new lines', () => {
    expect([dateOf('2004-06-01'), dateOf('1/6/2004'), dateOf('1998'), dateOf('31/02/2004'), dateOf('soon')]).toEqual(['2004-06-01', '2004-06-01', '1998-01-01', undefined, undefined])
    expect(table('a,"b, c","d\ne"\n\nf,g\n')).toEqual([{ line: 1, cells: ['a', 'b, c', 'd\ne'] }, { line: 4, cells: ['f', 'g'] }])
  })
})

describe('importing awards', () => {
  it('tries the file first, then imports it in the background, and a second run adds nothing', async () => {
    const type = await awardType({ givesTicketBenefit: true })
    const known = await holder('Known Fellow')
    await rows('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'self\', ?) RETURNING id', newId('aem'), known.accountId, 'known.fellow@example.org', NOV_17, NOV_17)
    await issue(type, { recipientName: 'Already Here', awardedOn: '1990-01-01' })
    const file = [
      'Name,Awarded,For,Citation,Email',
      'Peggy Ashcroft,1998,Front of house,"For forty years, and counting."',
      'Known Fellow,01/06/2004,,,known.fellow@example.org',
      'New Fellow,2010-06-01,Lighting,,new.fellow@example.org',
      ',2011,No name',
      'Bad Date,sometime',
      'Peggy Ashcroft,1998',
      'Already Here,1990',
      'Bad Address,2012,,,not-an-address',
    ].join('\n')

    const tried = await send(type, file, true)
    expect(tried.status, JSON.stringify(tried.body)).toBe(200)
    expect(tried.body).toMatchObject({ queued: 0, wouldImport: 3 })
    expect(tried.body.refused).toEqual([
      { line: 5, reason: 'no-name' },
      { line: 6, reason: 'bad-date' },
      { line: 7, reason: 'repeated' },
      { line: 8, reason: 'already-recorded' },
      { line: 9, reason: 'not-an-address' },
    ])
    expect(await rows('SELECT 1 FROM core_account_emails WHERE address = ?', 'new.fellow@example.org')).toEqual([])
    expect((await send(type, file, true, person([]))).status).toBe(403)

    expect((await send(type, file, false)).body).toMatchObject({ queued: 3 })
    await deliver()
    const imported = await rows('SELECT recipient_name AS name, awarded_on AS awardedOn, awarded_for AS awardedFor, citation, source, account_id IS NOT NULL AS linked FROM awards_awards WHERE type_id = ? AND source = \'import\' ORDER BY awarded_on', type)
    expect(imported).toEqual([
      { name: 'Peggy Ashcroft', awardedOn: '1998-01-01', awardedFor: 'Front of house', citation: 'For forty years, and counting.', source: 'import', linked: 0 },
      { name: 'Known Fellow', awardedOn: '2004-06-01', awardedFor: null, citation: null, source: 'import', linked: 1 },
      { name: 'New Fellow', awardedOn: '2010-06-01', awardedFor: 'Lighting', citation: null, source: 'import', linked: 1 },
    ])
    expect(await rows('SELECT account_id FROM awards_awards WHERE type_id = ? AND recipient_name = ?', type, 'Known Fellow')).toEqual([{ account_id: known.accountId }])
    // Each import announces the award like any other; no message goes to the holder.
    expect(await rows('SELECT 1 FROM core_events WHERE name = ? AND record_id IN (SELECT id FROM awards_awards WHERE type_id = ?)', 'awards.award.issued', type)).toHaveLength(4)

    const again = await send(type, file, false)
    expect(again.body.code).toBe('awards.import.nothing')
  })

  it('refuses a row for the importer\'s own account, and a once-only award twice for one address', async () => {
    const type = await awardType()
    const me = await holder('Self Importer')
    await rows('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'self\', ?) RETURNING id', newId('aem'), me.accountId, 'self.importer@example.org', NOV_17, NOV_17)
    const self = person(['awards.award.issue'], { accountId: me.accountId, reassertedAt: NOV_17 })
    const tried = await send(type, 'Self Importer,2001,,,self.importer@example.org\nA Twin,2002,,,twin@example.org\nA. Twin,2003,,,twin@example.org\n', true, self)
    expect(tried.body).toMatchObject({ wouldImport: 1, refused: [{ line: 1, reason: 'own-account' }, { line: 3, reason: 'repeated' }] })
  })
})
