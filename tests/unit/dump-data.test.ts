import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dumpData, orderTables } from '#migration/dump-data'

// The publish step (0072): plain INSERT files a fresh D1 can execute in order, parents first.

const SCHEMA = `
  CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT NOT NULL, weight REAL, blob BLOB);
  CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parents(id), note TEXT);
  CREATE TABLE grandchildren (id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id));
`

function smallDatabase(): Database {
  const db = new Database(':memory:')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  db.exec(`
    INSERT INTO parents VALUES ('p-1', 'O''Brien; the first', 1.5, X'0102');
    INSERT INTO parents VALUES ('p-2', 'Plain', NULL, NULL);
    INSERT INTO children VALUES ('c-1', 'p-1', 'a note
    over two lines');
    INSERT INTO grandchildren VALUES ('g-1', 'c-1');
  `)
  return db
}

describe('orderTables puts every parent before its children', () => {
  test('a referenced table lands before the table referencing it, whatever order it was named in', () => {
    const db = new Database(':memory:')
    db.exec(SCHEMA)
    const ordered = orderTables(db, ['grandchildren', 'children', 'parents'])
    expect(ordered).toEqual(['parents', 'children', 'grandchildren'])
  })

  test('a self-reference does not stall the walk', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES nodes(id));')
    expect(orderTables(db, ['nodes'])).toEqual(['nodes'])
  })
})

describe('dumpData writes INSERT files that reload into the same schema', () => {
  const dirs: string[] = []
  const scratch = (): string => {
    const dir = join(tmpdir(), `nnt-dump-data-${crypto.randomUUID()}`)
    dirs.push(dir)
    return dir
  }
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  test('every row comes back byte for byte, quotes, newlines, reals, blobs and NULLs included', async () => {
    const source = smallDatabase()
    const dir = scratch()

    // The files must be complete the moment the call settles: reset-production.sh reads them next.
    const { files, statements, counts } = await dumpData(source, dir, { skipLedger: true })
    expect(statements).toBe(4)
    expect(counts).toEqual({ parents: 2, children: 1, grandchildren: 1 })
    expect(files).toEqual(['001-data.sql'])
    // The drop script sits beside the data files for reset-production.sh, children first.
    expect(readdirSync(dir)).toEqual(['000-drop.sql', ...files])

    const reloaded = new Database(':memory:')
    reloaded.exec('PRAGMA foreign_keys = ON;')
    reloaded.exec(SCHEMA)
    for (const file of files) reloaded.exec(await Bun.file(join(dir, file)).text())

    for (const table of ['parents', 'children', 'grandchildren']) {
      const sql = `SELECT * FROM "${table}" ORDER BY id`
      expect(reloaded.query(sql).all()).toEqual(source.query(sql).all())
    }
  })

  test('the file names parents before children so foreign keys resolve as they load', async () => {
    const source = smallDatabase()
    const dir = scratch()
    const { files } = await dumpData(source, dir, { skipLedger: true })
    const text = await Bun.file(join(dir, files[0]!)).text()
    expect(text.indexOf('INSERT INTO "parents"')).toBeLessThan(text.indexOf('INSERT INTO "children"'))
    expect(text.indexOf('INSERT INTO "children"')).toBeLessThan(text.indexOf('INSERT INTO "grandchildren"'))
  })

  test('an empty table writes nothing but is still counted', async () => {
    const db = new Database(':memory:')
    db.exec(SCHEMA)
    const { files, statements, counts } = await dumpData(db, scratch(), { skipLedger: true })
    expect(files).toEqual([])
    expect(statements).toBe(0)
    expect(counts).toEqual({ parents: 0, children: 0, grandchildren: 0 })
  })
})
