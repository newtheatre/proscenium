#!/usr/bin/env bun
// Realistic test data in one command (K-120). It cannot touch production: the refusal is an
// allow-list of local targets, and there is no flag to override it.

import { Database } from 'bun:sqlite'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { assertLocalTarget, assertNotProduction, generatePassword } from '../tests/helpers/seed'
import { seed } from './seed/index'
import { sqliteTarget } from './seed/statements'

const DEFAULT_TARGET = '.data/db/sqlite.db'
const target = process.argv[2] ?? DEFAULT_TARGET

// Before the database is opened, so a mistake cannot get as far as a connection.
assertNotProduction()
assertLocalTarget(target)

// The same scrypt the application hashes with, so a seeded password actually signs in. The app
// reaches it through nuxt-auth-utils, which a script cannot import.
const hasher = new Hash(new Scrypt({}))

const db = new Database(target)

if (!db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get()) {
  console.error(`${target} has no schema. Run \`bun run dev\` once, or apply the migrations, then try again.`)
  process.exit(1)
}

db.run('PRAGMA foreign_keys = ON')

const result = await seed(sqliteTarget(db), {
  hash: password => hasher.make(password),
  password: generatePassword,
  token: () => crypto.randomUUID(),
})

db.close()

// Beside the database it describes, and the same file `/dev` reads: a persona seeded from here is
// one the developer tools can still find after erasure rewrote its address (0011).
const devDir = process.env.NUXT_HUB_DIR ?? '.data'
await Bun.write(`${devDir}/personas.json`, JSON.stringify(result.personaMap, null, 2))

const order = [
  ['people', 'people'],
  ['rooms', 'rooms'],
  ['externalSpaces', 'SU rooms'],
  ['roomBookings', 'room bookings'],
  ['externalRequests', 'external requests'],
  ['blackouts', 'blackouts'],
  ['modules', 'training modules'],
  ['trainingRecords', 'training records'],
  ['trainingSessions', 'training sessions'],
  ['venues', 'venues'],
  ['seasons', 'seasons'],
  ['shows', 'shows'],
  ['performances', 'performances'],
  ['reservations', 'reservations'],
  ['tickets', 'tickets'],
  ['discounts', 'discounts'],
  ['shifts', 'shifts'],
  ['incidents', 'incidents'],
  ['ageChecks', 'age checks'],
  ['checklistStamps', 'checklist stamps'],
  ['barProducts', 'bar products'],
  ['barVariants', 'bar variants'],
  ['barItems', 'stocked items'],
  ['stockMovements', 'stock movements'],
  ['ledgerEntries', 'ledger entries'],
  ['auditEntries', 'audit entries'],
  ['inboxItems', 'inbox items'],
  ['notifications', 'notifications'],
] as const

console.info(`\nSeeded ${target}\n`)
for (const [key, label] of order) {
  console.info(`  ${String(result.counts[key] ?? 0).padStart(4)}  ${label}`)
}

console.info('\n  Performances land in the past, tonight and the future, with one sold out, one')
console.info('  cancelled, one a draft and one ticketed by somebody else. Reservations cover every')
console.info('  status; training records and role grants each cover current, expiring and lapsed.\n')

// Printed once, and nowhere else. Nothing here is committed and there is no way to read a
// password back (K-120 criterion 1).
console.info('  Sign in as any of these. The passwords are shown here and nowhere else:\n')
for (const account of result.secrets.accounts) {
  console.info(`    ${account.email}\n      ${account.password}`)
}

if (result.secrets.boardTokens.length) {
  console.info('\n  Backstage board join tokens, also shown only here:\n')
  for (const token of result.secrets.boardTokens) {
    console.info(`    ${token.label}, ${token.night}\n      ${token.token}`)
  }
}

if (result.secrets.feedTokens.length) {
  console.info('\n  Calendar feed tokens, also shown only here:\n')
  for (const token of result.secrets.feedTokens) {
    console.info(`    ${token.person}\n      ${token.token}`)
  }
}

console.info('\n  The development personas (dev-admin@, dev-foh@ and the rest) are seeded too, and')
console.info('  `/dev` signs in as any of them without a password.\n')
console.info('  Give one of them the run of the place with:')
console.info(`    bun run grant-admin ${result.secrets.accounts[0]?.email ?? 'dev-admin@e2e.newtheatre.org.uk'}\n`)
