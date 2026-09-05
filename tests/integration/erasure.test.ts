import { describe, expect, test } from 'bun:test'
import { EXPORTED_TABLES, PERSONAL_TABLES } from '#shared/utils/personal-data'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// Named regression cases (K-121). Erasure is anonymisation in one transaction (0011). These run
// the real migrations, so the triggers are the ones production has rather than a description.

const NAME = 'Imogen Hart'
const EMAIL = 'imogen.hart@example.invalid'
const REDACTED = JSON.stringify({ redacted: true })

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

// A fixture with a row in every table the registry knows, so completeness has something to find.
function seedPerson(database: TestDatabase, id = 'u-erase'): string {
  const now = Math.floor(Date.now() / 1000)
  database.batch([
    ['INSERT INTO users (id, email, name, pronouns, password, verified) VALUES (?, ?, ?, ?, ?, 1)',
      id, EMAIL, NAME, 'she/her', 'scrypt$fake'],
    ['INSERT INTO emergency_contacts (user_id, name, phone, relation, updated_at) VALUES (?, ?, ?, ?, ?)',
      id, 'Her Mother', '07700 900000', 'mother', now],
    ['INSERT INTO memberships (id, user_id, starts_on, expires_on, source, evidence, granted_by) VALUES (?, ?, \'2026-09-14\', \'2027-09-13\', ?, ?, ?)',
      `m-${id}`, id, 'MANUAL', `paid in person, ${NAME}`, id],
    ['INSERT INTO role_grants (id, user_id, role, granted_at, note) VALUES (?, ?, ?, ?, ?)',
      `g-${id}`, id, 'BOX_OFFICE', now, `${NAME} asked for this`],
    ['INSERT INTO totp_secrets (user_id, secret, created_at) VALUES (?, ?, ?)', id, 'SECRETSECRET', now],
    ['INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)', `r-${id}`, id, 'abcdef'],
    ['INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, created_at) VALUES (?, ?, ?, ?, 0, ?)',
      `p-${id}`, id, `cred-${id}`, 'key', now],
    ['INSERT INTO auth_tokens (id, user_id, kind, token_hash, email, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      `t-${id}`, id, 'EMAIL_VERIFY', `hash-${id}`, EMAIL, now + 3600],
    ['INSERT INTO mfa_attempts (id, user_id, expires_at) VALUES (?, ?, ?)', `a-${id}`, id, now + 300],
    ['INSERT INTO notification_preferences (user_id, topic, email, push) VALUES (?, ?, 1, 0)', id, 'BOOKINGS'],
    ['INSERT INTO notification_log (id, user_id, type, channel, subject, status) VALUES (?, ?, ?, ?, ?, ?)',
      `n-${id}`, id, 'account.verify', 'EMAIL', `${NAME}, confirm your address`, 'SENT'],
    ['INSERT INTO inbox_items (id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)',
      `i-${id}`, id, 'note', `A message for ${NAME}`, `about ${EMAIL}`],
    // An entry that picked up an identifying value despite the write-time guard: the case the
    // redaction exists for (0011, "aim is not guarantee").
    ['INSERT INTO audit_log (id, actor_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      `al-${id}`, id, 'account.registered', `user:${id}`, JSON.stringify({ who: NAME, address: EMAIL }), now],
    ['INSERT INTO rooms (id, name) VALUES (?, ?)', `room-${id}`, 'The Studio'],
    ['INSERT INTO room_feed_tokens (id, user_id, token_hash) VALUES (?, ?, ?)', `f-${id}`, id, `feed-${id}`],
    // Everything a member types about a booking: the title, the note, why they asked for an
    // exception, and what was written back when it was refused (C-108, C-109).
    [`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, status, notes, reason, rejection_reason)
      VALUES (?, ?, ?, ?, ?, ?, 'REJECTED', ?, ?, ?)`,
    `b-${id}`, `room-${id}`, id, `${NAME}'s read-through`, now + 3600, now + 7200,
    `${NAME} has a key`, `${NAME} needs it for a deadline`, `Told ${NAME} the room is in a get-in`],
    // The card this person last edited. It describes the building, so an erasure leaves all of
    // it, including the reference to the tombstone the account became.
    ['INSERT INTO venues (id, name, room_id) VALUES (?, ?, ?)', `venue-${id}`, 'The Theatre', `room-${id}`],
    [`INSERT INTO venue_emergency_info (venue_id, assembly_point, exits, notes, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    `venue-${id}`, 'The car park behind the building', 'Two, both stage left',
    'The isolation point is behind the bar', id, now],
    // Stock this person moved. The movement is financial evidence and holds no free text at all,
    // which is why it survives an erasure with only the tombstone's reference in it (F-114).
    ['INSERT INTO bar_items (id, name, unit) VALUES (?, ?, ?)', `bi-${id}`, 'House red', 'ML'],
    [`INSERT INTO stock_movements (id, item_id, qty, kind, reason, actor_id, created_at)
      VALUES (?, ?, -750, 'WASTAGE', 'BREAKAGE', ?, ?)`, `sm-${id}`, `bi-${id}`, id, now],
    // Who opened and closed a night's till. Holds no free text, so it survives untouched too.
    [`INSERT INTO till_sessions (id, venue_id, night, opened_by, closed_by, closed_at)
      VALUES (?, ?, '2026-09-01', ?, ?, ?)`, `till-${id}`, `venue-${id}`, id, id, now],
    // Who opened and applied a stocktake. Holds no free text either (F-115).
    [`INSERT INTO stocktakes (id, status, opened_by, applied_by, applied_at)
      VALUES (?, 'APPLIED', ?, ?, ?)`, `stk-${id}`, id, id, now],
    // A shift somebody worked, and the template the venue stamps. Who staffed a performance is
    // the staffing record; the note written on the slot is not (E-102, E-106).
    ['INSERT INTO shows (id, slug, title) VALUES (?, ?, ?)', `show-${id}`, `a-show-${id}`, 'A Show'],
    ['INSERT INTO performances (id, show_id, venue_id, starts_at) VALUES (?, ?, ?, ?)',
      `perf-${id}`, `show-${id}`, `venue-${id}`, now + 3600],
    ['INSERT INTO shift_templates (id, venue_id, role, "count", updated_by) VALUES (?, ?, ?, 1, ?)',
      `st-${id}`, `venue-${id}`, 'DUTY_MANAGER', id],
    [`INSERT INTO shifts (id, performance_id, role, slot, user_id, status, notes, assigned_by)
      VALUES (?, ?, ?, 1, ?, 'CONFIRMED', ?, ?)`,
    `sh-${id}`, `perf-${id}`, 'DUTY_MANAGER', id, `${NAME} has the keys`, id],
    // A price this person set. Append-only and free of anything but a figure and a date, which is
    // why an erasure leaves it with only the tombstone's reference in it (F-116).
    ['INSERT INTO bar_categories (id, name) VALUES (?, ?)', `bc-${id}`, 'Wine'],
    ['INSERT INTO bar_products (id, category_id, name) VALUES (?, ?, ?)', `bp-${id}`, `bc-${id}`, 'House red'],
    [`INSERT INTO product_variants (id, product_id, serving_kind, label) VALUES (?, ?, 'bottle', 'Bottle')`,
      `pv-${id}`, `bp-${id}`],
    [`INSERT INTO variant_prices (id, variant_id, price_pence, effective_from, created_at, created_by)
      VALUES (?, ?, 1800, '2026-09-14', ?, ?)`, `vp-${id}`, `pv-${id}`, now, id],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', `dept-${id}`, 'Technical'],
    ['INSERT INTO department_leads (id, department, user_id) VALUES (?, ?, ?)', `dl-${id}`, `dept-${id}`, id],
    ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)',
      `mod-${id}`, `dept-${id}`, 'MODULE', 'Working at height'],
    // Two records, because the append-only guard treats them differently: free text on a live one,
    // and free text written at revocation on one already revoked (0010, G-122 criterion 6).
    [`INSERT INTO training_records (id, user_id, module_id, awarded_on, source, evidence_ref, granted_by)
      VALUES (?, ?, ?, '2026-09-14', 'SIGNOFF', ?, ?)`,
    `tr-${id}`, id, `mod-${id}`, `Certificate held by ${NAME}`, id],
    [`INSERT INTO training_records (id, user_id, module_id, awarded_on, source, granted_by,
      revoked_at, revoked_by, revoke_reason)
      VALUES (?, ?, ?, '2026-09-14', 'SIGNOFF', ?, ?, ?, ?)`,
    `tr2-${id}`, id, `mod-${id}`, id, now, id, `${NAME} was found not competent`],
    [`INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, notes, trainer_id)
      VALUES (?, '2027-01-14', '19:00', '21:00', 20, ?, ?)`,
    `ts-${id}`, `${NAME} is bringing the harnesses`, id],
    // Holds no free text at all, which is the whole reason it survives an erasure untouched.
    [`INSERT INTO session_attendees (id, session_id, user_id, status, signed_up_at)
      VALUES (?, ?, ?, 'ATTENDED', ?)`, `sa-${id}`, `ts-${id}`, id, now],
  ])
  return id
}

// The erasure statements, run the way production runs them: one batch, all or nothing.
async function erase(database: TestDatabase, id: string): Promise<void> {
  const { erasureStatements } = await import('#shared/utils/erasure')
  const now = Math.floor(Date.now() / 1000)
  database.batch(erasureStatements(id, now).map(statement => boundStatement(database, statement)))
}

// Everything the export would hand over, which is what completeness is measured against.
function exported(database: TestDatabase, id: string): string {
  const collected: Record<string, unknown[]> = {}
  for (const entry of EXPORTED_TABLES) {
    collected[entry.section!] = rows(database, `
      SELECT ${entry.columns!.join(', ')} FROM ${entry.name} WHERE ${entry.column} = ?
    `, id)
  }
  return JSON.stringify(collected)
}

describe('erasure (K-109, 0011)', () => {
  test('erasure completeness: no personal value survives anywhere the export reaches', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      expect(exported(database, id)).toContain(NAME)

      await erase(database, id)

      const bundle = exported(database, id)
      expect(bundle).not.toContain(NAME)
      expect(bundle).not.toContain(EMAIL)
      expect(bundle).not.toContain('she/her')
      expect(bundle).not.toContain('Her Mother')
      expect(bundle).not.toContain('07700 900000')

      // Nothing outside the export either: the whole database is checked, not just the bundle.
      for (const entry of PERSONAL_TABLES) {
        const all = JSON.stringify(rows(database, `SELECT * FROM ${entry.name}`))
        expect(`${entry.name}: ${all.includes(NAME) || all.includes(EMAIL)}`).toBe(`${entry.name}: false`)
      }
    })
  })

  test('an anonymised row is never written back over', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      await erase(database, id)

      // The guard is the database's, so it holds for a handler nobody has written yet.
      expect(() => database.batch([['UPDATE users SET name = ? WHERE id = ?', NAME, id]])).toThrow()
      expect(() => database.batch([['UPDATE users SET email = ? WHERE id = ?', EMAIL, id]])).toThrow()
      expect(() => database.batch([['UPDATE users SET password = ? WHERE id = ?', 'scrypt$new', id]])).toThrow()
      expect(() => database.batch([['UPDATE users SET anonymised_at = NULL WHERE id = ?', id]])).toThrow()

      // Disabling one is meaningless but harmless, so the guard does not stand in its way.
      expect(() => database.batch([['UPDATE users SET disabled = 1 WHERE id = ?', id]])).not.toThrow()
    })
  })

  test('booking and sales statistics survive an erasure', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      await erase(database, id)

      // The room was used, which is a fact about the room. What the person wrote about it, and
      // what was written back to them, is not (0011).
      const bookings = rows<{ status: string, title: string | null, notes: string | null, reason: string | null, rejection: string | null }>(
        database,
        'SELECT status, title, notes, reason, rejection_reason AS rejection FROM room_bookings WHERE user_id = ?',
        id)
      expect(bookings).toHaveLength(1)
      // The title cannot be null, so it becomes a neutral one rather than failing the batch.
      expect(bookings[0]).toMatchObject({ status: 'REJECTED', title: 'Erased booking', notes: null, reason: null, rejection: null })

      // Sales have no table yet. What exists of the same kind is the membership year and the
      // message log, and both survive without the person in them.
      const memberships = rows<{ startsOn: string, evidence: string | null }>(database,
        'SELECT starts_on AS startsOn, evidence FROM memberships WHERE user_id = ?', id)
      expect(memberships).toHaveLength(1)
      expect(memberships[0]).toMatchObject({ startsOn: '2026-09-14', evidence: null })

      const messages = rows<{ status: string, subject: string | null }>(database,
        'SELECT status, subject FROM notification_log WHERE user_id = ?', id)
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({ status: 'SENT', subject: null })

      // The calendar link is a credential, so it goes rather than being scrubbed: left behind, an
      // erased person's phone would keep resolving their bookings (C-104).
      expect(rows(database, 'SELECT id FROM room_feed_tokens WHERE user_id = ?', id)).toHaveLength(0)

      // A card describes a building, so erasing the officer who wrote it changes nothing: front
      // of house must still find the assembly point in the dark.
      const card = rows<{ assembly_point: string | null, updated_by: string | null }>(database,
        'SELECT assembly_point, updated_by FROM venue_emergency_info WHERE updated_by = ?', id)
      expect(card).toHaveLength(1)
      expect(card[0]).toMatchObject({ assembly_point: 'The car park behind the building', updated_by: id })

      // Who staffed a performance survives, because the night report and the staffing record
      // read it. What was written on the slot about them does not (E-102).
      const worked = rows<{ role: string, status: string, notes: string | null }>(database,
        'SELECT role, status, notes FROM shifts WHERE user_id = ?', id)
      expect(worked).toHaveLength(1)
      expect(worked[0]).toMatchObject({ role: 'DUTY_MANAGER', status: 'CONFIRMED', notes: null })

      // How a venue is staffed describes the house, so the template is left exactly as it was.
      const staffing = rows<{ role: string, updated_by: string | null }>(database,
        'SELECT role, updated_by FROM shift_templates WHERE updated_by = ?', id)
      expect(staffing).toHaveLength(1)

      // A price is a figure and a date, nothing about a person beyond who set it, and a past
      // sale resolved against it: the row survives whole (F-116).
      const priced = rows<{ price_pence: number, created_by: string | null }>(database,
        'SELECT price_pence, created_by FROM variant_prices WHERE created_by = ?', id)
      expect(priced).toHaveLength(1)
      expect(priced[0]).toMatchObject({ price_pence: 1800, created_by: id })

      // The row itself is still there for everything referring to it.
      expect(rows(database, 'SELECT id FROM users WHERE id = ?', id)).toHaveLength(1)
    })
  })

  test('the erasure hook is idempotent under retry', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      await erase(database, id)

      const after = JSON.stringify(rows(database, 'SELECT * FROM users WHERE id = ?', id))
      const trail = JSON.stringify(rows(database, 'SELECT * FROM audit_log WHERE actor_id = ?', id))

      // A retry rewrites nothing: the tombstone guard would refuse a second identifying write,
      // and the redaction is a fixed shape, so the second run is a no-op rather than a failure.
      await erase(database, id)

      expect(JSON.stringify(rows(database, 'SELECT * FROM users WHERE id = ?', id))).toBe(after)
      expect(JSON.stringify(rows(database, 'SELECT * FROM audit_log WHERE actor_id = ?', id))).toBe(trail)
    })
  })

  // J-102 criteria 2 and 4: the trail keeps what happened, and loses who it was about.
  test('an identifying value in an audit detail is redacted, and the entry survives it', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database)
      await erase(database, id)

      const entries = rows<{ action: string, target: string, detail: string, actor_id: string }>(database,
        'SELECT action, target, detail, actor_id FROM audit_log WHERE id = ?', `al-${id}`)

      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        action: 'account.registered',
        target: `user:${id}`,
        actor_id: id,
        detail: REDACTED,
      })
    })
  })
})

// A tombstone that still says when somebody last signed in is still saying something about them.
describe('erasure takes the credential timestamps with it (A-113)', () => {
  test('nothing is left saying when a way in was added or used', async () => {
    await withDatabase(async (database) => {
      const id = seedPerson(database, 'u-credentials')
      const now = Math.floor(Date.now() / 1000)
      database.batch([[
        'UPDATE users SET password_set_at = ?, password_last_used_at = ?, google_linked_at = ?, google_last_used_at = ? WHERE id = ?',
        now, now, now, now, id,
      ]])

      await erase(database, id)

      const [row] = rows<Record<string, number | null>>(database, `
        SELECT password_set_at, password_last_used_at, google_linked_at, google_last_used_at
        FROM users WHERE id = ?`, id)
      expect(Object.values(row!).every(value => value === null)).toBe(true)
    })
  })
})

// A scrub that nulls a NOT NULL column throws, and erasure is one batch, so the whole erasure
// fails on a row nobody thought about. Checked against the schema the migrations actually build.
describe('every scrubbed column can hold what a scrub writes (0011)', () => {
  test('a NOT NULL column names what it becomes instead', async () => {
    await withDatabase((database) => {
      const offenders: string[] = []
      for (const entry of PERSONAL_TABLES) {
        if (entry.erasure !== 'scrub' || !entry.scrub?.length) continue
        const columns = rows<{ name: string, notnull: number }>(database, `PRAGMA table_info(${entry.name})`)
        for (const name of entry.scrub) {
          const column = columns.find(candidate => candidate.name === name)
          expect(`${entry.name}.${name} exists: ${column !== undefined}`).toBe(`${entry.name}.${name} exists: true`)
          if (column?.notnull === 1 && entry.scrubTo?.[name] === undefined) offenders.push(`${entry.name}.${name}`)
        }
      }
      expect(offenders).toEqual([])
    })
  })
})
