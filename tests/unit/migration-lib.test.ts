import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { execDump, idFor, parseStamp } from '#migration/lib'

// The dump loader, the timestamp reader and the id minting every transform shares.

describe('execDump runs a wrangler export one statement at a time', () => {
  test('a value holding ";\\n" and one holding a doubled quote both load intact, PRAGMA lines are skipped', () => {
    const db = new Database(':memory:')
    const text = [
      'PRAGMA foreign_keys=OFF;',
      'CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT);',
      'INSERT INTO t VALUES (1, \'first line;',
      'second line\');',
      'INSERT INTO t VALUES (2, \'it\'\'s\');',
      '',
    ].join('\n')

    expect(execDump(db, text)).toBe(3)
    const bodies = db.query<{ id: number, body: string }, []>('SELECT id, body FROM t ORDER BY id').all()
    expect(bodies).toEqual([
      { id: 1, body: 'first line;\nsecond line' },
      { id: 2, body: 'it\'s' },
    ])
  })

  test('CRLF line endings load the same as LF', () => {
    const db = new Database(':memory:')
    expect(execDump(db, 'CREATE TABLE t (id INTEGER);\r\nINSERT INTO t VALUES (1);\r\n')).toBe(2)
    expect(db.query<{ n: number }, []>('SELECT count(*) n FROM t').get()?.n).toBe(1)
  })

  test('a dump ending mid-statement throws rather than dropping the tail quietly', () => {
    const db = new Database(':memory:')
    const text = 'CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT);\nINSERT INTO t VALUES (1, \'open'
    expect(() => execDump(db, text)).toThrow(/dump ended mid-statement/)
  })
})

describe('parseStamp reads every spelling the old estate used, always as epoch seconds', () => {
  const expected = Date.UTC(2023, 10, 14, 22, 13, 20) / 1000

  test.each([
    ['epoch seconds', expected],
    ['epoch milliseconds', expected * 1000],
    ['SQLite text, UTC', '2023-11-14 22:13:20'],
    ['ISO with +00:00', '2023-11-14T22:13:20+00:00'],
    ['ISO with Z', '2023-11-14T22:13:20Z'],
  ])('%s', (_label, value) => {
    expect(parseStamp(value)).toBe(expected)
  })

  test('a zone offset is honoured rather than assumed UTC', () => {
    expect(parseStamp('2023-11-14T23:13:20+01:00')).toBe(expected)
  })

  test.each([
    ['garbage', 'not a date'],
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
  ])('%s is null, never NaN', (_label, value) => {
    expect(parseStamp(value)).toBeNull()
  })
})

describe('idFor keeps one unified id per old row', () => {
  test('a mapped key comes back as mapped', () => {
    const map = new Map([['room:1', 'already-minted']])
    expect(idFor(map, 'room:1')).toBe('already-minted')
    expect(map.size).toBe(1)
  })

  test('an unmapped key is minted once and recorded', () => {
    const map = new Map<string, string>()
    const fresh = idFor(map, 'room:2')
    expect(fresh).toMatch(/^[a-z0-9]{32}$/)
    expect(map.get('room:2')).toBe(fresh)
    expect(idFor(map, 'room:2')).toBe(fresh)
  })
})
