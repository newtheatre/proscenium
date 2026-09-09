import { describe, expect, test } from 'bun:test'
import {
  acknowledgeStatement,
  acknowledgementsForNightQuery,
  ensureNightStatement,
  insertMilestoneTypeStatement,
  insertPresetStatement,
  joinDeviceStatement,
  messagesForNightQuery,
  milestoneTypesQuery,
  nightRowQuery,
  postMessageStatement,
  presetsQuery,
  purgeStaleMessagesStatement,
  recordFailedAttemptStatement,
  recordSuccessStatement,
  resetNightStatement,
  retireMilestoneTypeStatement,
  retirePresetStatement,
  revokeDevicesStatement,
  staleMessagesQuery,
  supersedeMessageStatement,
  updateMilestoneTypeStatement,
} from '#server/utils/backstage'
import { MAX_FAILED_ATTEMPTS } from '#shared/utils/backstage'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// E-120's pure statement and query builders against the real migrations. The async orchestration
// (`attemptJoin`, `currentCode`) needs the live `db` singleton and is covered end to end.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): Record<string, unknown>[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows(database, query, ...parameters)
}

const NIGHT = '2026-09-14'

describe('a night row is created once (criteria 2, 3)', () => {
  test('ensuring it twice makes one row', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-2'))

      const found = run(database, nightRowQuery(venue.id, NIGHT))
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({ id: 'bn-1', epoch: 0, failedAttempts: 0 })
    })
  })

  test('two venues, or two nights at the same venue, are two rows', async () => {
    await withDatabase((database) => {
      const a = testVenue(database, { suffix: 'a' })
      const b = testVenue(database, { suffix: 'b' })
      run(database, ensureNightStatement(a.id, NIGHT, 'bn-a'))
      run(database, ensureNightStatement(b.id, NIGHT, 'bn-b'))
      run(database, ensureNightStatement(a.id, '2026-09-15', 'bn-a2'))

      expect(run(database, nightRowQuery(a.id, NIGHT))).toHaveLength(1)
      expect(run(database, nightRowQuery(b.id, NIGHT))).toHaveLength(1)
      expect(run(database, nightRowQuery(a.id, '2026-09-15'))).toHaveLength(1)
    })
  })
})

describe('ten failed attempts rotate the code (criterion 4)', () => {
  test('the epoch holds through nine failures and moves on the tenth, with the counter reset', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))

      for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
        const [result] = run(database, recordFailedAttemptStatement('bn-1'))
        expect(result).toMatchObject({ epoch: 0, failedAttempts: attempt })
      }

      const [rotated] = run(database, recordFailedAttemptStatement('bn-1'))
      expect(rotated).toMatchObject({ epoch: 1, failedAttempts: 0 })
    })
  })

  test('a success resets the counter without moving the epoch', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, recordFailedAttemptStatement('bn-1'))
      run(database, recordFailedAttemptStatement('bn-1'))

      run(database, recordSuccessStatement('bn-1'))

      const [after] = run(database, nightRowQuery(venue.id, NIGHT))
      expect(after).toMatchObject({ epoch: 0, failedAttempts: 0 })
    })
  })
})

describe('a joined device (criterion 1)', () => {
  test('holds a label and a token hash, and nothing that names a person', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))

      const [row] = rows<{ label: string, token_hash: string, joined_epoch: number }>(
        database, 'SELECT label, token_hash, joined_epoch FROM backstage_devices WHERE id = ?', 'bd-1')
      expect(row).toMatchObject({ label: 'Stage left', token_hash: 'a'.repeat(64), joined_epoch: 0 })
    })
  })

  test('two devices cannot share a token hash', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      database.batch([['INSERT INTO backstage_devices (id, night_id, label, token_hash, joined_epoch) VALUES (?, ?, ?, ?, ?)',
        'bd-1', 'bn-1', 'Stage left', 'a'.repeat(64), 0]])

      expect(() => database.batch([['INSERT INTO backstage_devices (id, night_id, label, token_hash, joined_epoch) VALUES (?, ?, ?, ?, ?)',
        'bd-2', 'bn-1', 'Stage right', 'a'.repeat(64), 0]])).toThrow()
    })
  })
})

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

describe('the six named milestone types are seeded, committee-configurable from there (E-121 criterion 1)', () => {
  test('all six exist, none retired', async () => {
    await withDatabase((database) => {
      const found = run(database, milestoneTypesQuery(false))
      expect(found).toHaveLength(6)
      expect(found.map(row => row.label)).toEqual(
        ['Clearance', 'House open', 'Curtain up', 'Interval', 'Restart', 'End'])
    })
  })

  test('the committee can add a seventh without a migration', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      run(database, insertMilestoneTypeStatement('Fire check', 6, officer, 'mt-7'))
      expect(run(database, milestoneTypesQuery(false))).toHaveLength(7)
    })
  })

  test('editing or retiring one does not remove it, only hides it from new stamps', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const [clearance] = run(database, milestoneTypesQuery(false))
      run(database, updateMilestoneTypeStatement(clearance!.id as string, 'Clearance given', 0, officer))
      run(database, retireMilestoneTypeStatement(clearance!.id as string, false, officer))

      expect(run(database, milestoneTypesQuery(false))).toHaveLength(5)
      expect(run(database, milestoneTypesQuery(true))).toHaveLength(6)
    })
  })
})

describe('presets are committee configuration, none seeded (criterion 2)', () => {
  test('added, read, and retired without disappearing', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      expect(run(database, presetsQuery(false))).toHaveLength(0)

      run(database, insertPresetStatement('5 minutes', 'Five minutes please', 0, officer, 'p-1'))
      expect(run(database, presetsQuery(false))).toHaveLength(1)

      run(database, retirePresetStatement('p-1', false, officer))
      expect(run(database, presetsQuery(false))).toHaveLength(0)
      expect(run(database, presetsQuery(true))).toHaveLength(1)
    })
  })
})

describe('posting a message (criteria 1, 2)', () => {
  function nightAndDevice(database: TestDatabase): { nightId: string, deviceId: string } {
    const venue = testVenue(database)
    run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
    run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))
    return { nightId: 'bn-1', deviceId: 'bd-1' }
  }

  test('a milestone message is stamped with a poster and a composed time', async () => {
    await withDatabase((database) => {
      const { nightId, deviceId } = nightAndDevice(database)
      const [clearance] = run(database, milestoneTypesQuery(false))

      run(database, postMessageStatement(nightId, deviceId, clearance!.id as string, 'Clearance', 1700000000, 'msg-1'))

      const [found] = run(database, messagesForNightQuery(nightId))
      expect(found).toMatchObject({ posterLabel: 'Stage left', milestoneLabel: 'Clearance', body: 'Clearance', composedAt: 1700000000 })
    })
  })

  test('a preset or free-text message carries no milestone', async () => {
    await withDatabase((database) => {
      const { nightId, deviceId } = nightAndDevice(database)
      run(database, postMessageStatement(nightId, deviceId, null, 'Five minutes please', 1700000000, 'msg-1'))

      const [found] = run(database, messagesForNightQuery(nightId))
      expect(found).toMatchObject({ milestoneTypeId: null, milestoneLabel: null, body: 'Five minutes please' })
    })
  })

  test('newest first', async () => {
    await withDatabase((database) => {
      const { nightId, deviceId } = nightAndDevice(database)
      run(database, postMessageStatement(nightId, deviceId, null, 'First', 1700000000, 'msg-1'))
      run(database, postMessageStatement(nightId, deviceId, null, 'Second', 1700000100, 'msg-2'))

      const found = run(database, messagesForNightQuery(nightId))
      expect(found.map(row => row.body)).toEqual(['Second', 'First'])
    })
  })

  test('the table refuses an edit outright: only a correction changes what was said', async () => {
    await withDatabase((database) => {
      const { nightId, deviceId } = nightAndDevice(database)
      run(database, postMessageStatement(nightId, deviceId, null, 'First', 1700000000, 'msg-1'))

      expect(() => database.batch([['UPDATE backstage_messages SET body = ? WHERE id = ?', 'Changed', 'msg-1']])).toThrow()
    })
  })
})

describe('correcting a milestone (criterion 5)', () => {
  function milestoneMessage(database: TestDatabase): { nightId: string, deviceId: string, milestoneTypeId: string } {
    const venue = testVenue(database)
    run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
    run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))
    const [interval] = run(database, milestoneTypesQuery(false)).filter(row => row.label === 'Interval')
    run(database, postMessageStatement('bn-1', 'bd-1', interval!.id as string, 'Interval', 1700000000, 'msg-1'))
    return { nightId: 'bn-1', deviceId: 'bd-1', milestoneTypeId: interval!.id as string }
  }

  test('a milestone can be corrected to a different one', async () => {
    await withDatabase((database) => {
      const { nightId, deviceId } = milestoneMessage(database)
      const [restart] = run(database, milestoneTypesQuery(false)).filter(row => row.label === 'Restart')

      const written = run(database, supersedeMessageStatement(nightId, 'msg-1', deviceId, restart!.id as string, 'Restart', 1700000100, 'msg-2'))
      expect(written).toHaveLength(1)

      const found = run(database, messagesForNightQuery(nightId))
      expect(found.find(row => row.id === 'msg-1')).toMatchObject({ milestoneLabel: 'Interval' })
      expect(found.find(row => row.id === 'msg-2')).toMatchObject({ milestoneLabel: 'Restart', supersedesId: 'msg-1' })
    })
  })

  test('a second correction on the same entry matches nothing', async () => {
    await withDatabase((database) => {
      const { nightId, deviceId, milestoneTypeId } = milestoneMessage(database)
      run(database, supersedeMessageStatement(nightId, 'msg-1', deviceId, milestoneTypeId, 'Interval', 1700000100, 'msg-2'))

      const second = run(database, supersedeMessageStatement(nightId, 'msg-1', deviceId, milestoneTypeId, 'Interval', 1700000200, 'msg-3'))
      expect(second).toHaveLength(0)
    })
  })

  test('free text and presets are never superseded', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))
      run(database, postMessageStatement('bn-1', 'bd-1', null, 'Chatter', 1700000000, 'msg-1'))
      const [clearance] = run(database, milestoneTypesQuery(false))

      const written = run(database, supersedeMessageStatement('bn-1', 'msg-1', 'bd-1', clearance!.id as string, 'Clearance', 1700000100, 'msg-2'))
      expect(written).toHaveLength(0)
    })
  })
})

describe('acknowledging a message (criterion 4)', () => {
  test('two devices acknowledge independently, a repeat changes nothing', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage right', 'b'.repeat(64), 0, 'bd-2'))
      run(database, postMessageStatement('bn-1', 'bd-1', null, 'Ready?', 1700000000, 'msg-1'))

      run(database, acknowledgeStatement('msg-1', 'bd-1', 'ack-1'))
      run(database, acknowledgeStatement('msg-1', 'bd-2', 'ack-2'))
      run(database, acknowledgeStatement('msg-1', 'bd-1', 'ack-3'))

      const found = run(database, acknowledgementsForNightQuery('bn-1'))
      expect(found).toHaveLength(2)
      expect(found.map(row => row.deviceId).sort()).toEqual(['bd-1', 'bd-2'])
    })
  })
})

describe('a reset (E-122 criterion 1)', () => {
  test('every joined device is revoked and the epoch moves, in one batch', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage right', 'b'.repeat(64), 0, 'bd-2'))

      run(database, revokeDevicesStatement('bn-1'))
      run(database, resetNightStatement('bn-1'))

      const devices = rows<{ revoked_at: number | null }>(database, 'SELECT revoked_at FROM backstage_devices WHERE night_id = ?', 'bn-1')
      expect(devices.every(row => row.revoked_at !== null)).toBe(true)
      expect(run(database, nightRowQuery(venue.id, NIGHT))[0]).toMatchObject({ epoch: 1, failedAttempts: 0 })
    })
  })

  test('a device that joins after the reset is not revoked by it', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, revokeDevicesStatement('bn-1'))
      run(database, resetNightStatement('bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 1, 'bd-1'))

      const [device] = rows<{ revoked_at: number | null }>(database, 'SELECT revoked_at FROM backstage_devices WHERE id = ?', 'bd-1')
      expect(device?.revoked_at).toBeNull()
    })
  })
})

describe('retention (E-122 criterion 4)', () => {
  test('a milestone is never counted as stale, whatever its age', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))
      const [clearance] = run(database, milestoneTypesQuery(false))
      run(database, postMessageStatement('bn-1', 'bd-1', clearance!.id as string, 'Clearance', 0, 'msg-1'))

      expect(run(database, staleMessagesQuery(9_999_999_999))).toHaveLength(0)
    })
  })

  test('free text past the cutoff is stale; free text before it is not', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))
      run(database, postMessageStatement('bn-1', 'bd-1', null, 'Old chatter', 1000, 'msg-old'))
      run(database, postMessageStatement('bn-1', 'bd-1', null, 'Recent chatter', 5000, 'msg-recent'))

      const stale = run(database, staleMessagesQuery(3000))
      expect(stale.map(row => row.id)).toEqual(['msg-old'])
    })
  })

  test('purging removes only what is stale and not a milestone', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))
      const [clearance] = run(database, milestoneTypesQuery(false))
      run(database, postMessageStatement('bn-1', 'bd-1', clearance!.id as string, 'Clearance', 1000, 'msg-milestone'))
      run(database, postMessageStatement('bn-1', 'bd-1', null, 'Old chatter', 1000, 'msg-old'))

      run(database, purgeStaleMessagesStatement(3000))

      const remaining = run(database, messagesForNightQuery('bn-1'))
      expect(remaining.map(row => row.id)).toEqual(['msg-milestone'])
    })
  })

  test('the trigger refuses to delete a milestone directly, purge statement or not', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))
      const [clearance] = run(database, milestoneTypesQuery(false))
      run(database, postMessageStatement('bn-1', 'bd-1', clearance!.id as string, 'Clearance', 0, 'msg-1'))

      expect(() => database.batch([['DELETE FROM backstage_messages WHERE id = ?', 'msg-1']])).toThrow()
    })
  })
})
