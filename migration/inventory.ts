// Per-table counts and domain checksums for all four dumps: the rehearsal baseline.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { OUT, SOURCES, count, ensureOut, latestStamp, loadDump, sum, tables } from './lib'

const stamp = latestStamp()
ensureOut()

type Manifest = {
  stamp: string
  generatedAt: string
  sources: Record<string, { tables: Record<string, number>, checks: Record<string, number> }>
}
const manifest: Manifest = { stamp, generatedAt: new Date().toISOString(), sources: {} }

for (const source of SOURCES) {
  const db = loadDump(source, stamp)
  const tableCounts: Record<string, number> = {}
  for (const t of tables(db)) tableCounts[t] = count(db, t)
  const checks: Record<string, number> = {}
  if (source === 'auth') {
    checks.users_anonymised = count(db, 'users', 'email LIKE \'%@anonymised.invalid\'')
    checks.users_workspace_password = count(db, 'users', 'email LIKE \'%@newtheatre.org.uk\' AND password IS NOT NULL')
    checks.users_guests = count(db, 'users', 'password IS NULL AND google_sub IS NULL')
    checks.users_disabled = count(db, 'users', 'disabled = 1')
  }
  if (source === 'proscenium') {
    checks.tickets_unrefunded_pence = sum(db, 'tickets', 'price_paid', 'refunded_at IS NULL')
    checks.tickets_refunded = count(db, 'tickets', 'refunded_at IS NOT NULL')
    checks.reservations_by_pending = count(db, 'reservations', 'status = \'PENDING\'')
    checks.incident_log = count(db, 'incident_log')
    checks.age_checks = count(db, 'age_checks')
    checks.stock_movement_qty_sum = sum(db, 'stock_movements', 'qty')
  }
  if (source === 'rooms') {
    checks.bookings_confirmed = count(db, 'bookings', 'status = \'CONFIRMED\'')
    checks.bookings_open = count(db, 'bookings', 'status IN (\'PENDING\',\'AWAITING_EXTERNAL\')')
  }
  if (source === 'training') {
    checks.records_unrevoked = count(db, 'records', 'revoked_at IS NULL')
    checks.attendance_attended = count(db, 'session_attendees', 'status = \'ATTENDED\'')
  }
  manifest.sources[source] = { tables: tableCounts, checks }
  db.close()
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))

let md = `# Migration inventory: dumps of ${stamp}\n`
for (const [source, data] of Object.entries(manifest.sources)) {
  md += `\n## ${source}\n\n| Table | Rows |\n| --- | --- |\n`
  for (const [t, n] of Object.entries(data.tables)) md += `| ${t} | ${n} |\n`
  if (Object.keys(data.checks).length) {
    md += `\nChecks: ${Object.entries(data.checks)
      .map(([k, v]) => `${k}=${v}`)
      .join(' · ')}\n`
  }
}
writeFileSync(join(OUT, 'manifest.md'), md)
console.log(`Inventory written for ${stamp}: out/manifest.json, out/manifest.md`)
