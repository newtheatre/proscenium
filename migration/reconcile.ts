// Verifies the transformed identity core against the source manifest. Non-zero exit on any
// failure: a rehearsal that cannot explain a number has failed (K-112, K-115).
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { OUT, count } from './lib'

const manifest = await Bun.file(join(OUT, 'manifest.json')).json()
const summary = await Bun.file(join(OUT, 'transform-summary.json')).json()
const target = new Database(join(OUT, 'unified.sqlite'), { readonly: true })

const failures: string[] = []
const notes: string[] = []
function check(name: string, ok: boolean, detail: string) {
  if (ok) notes.push(`ok: ${name} (${detail})`)
  else failures.push(`FAIL: ${name} (${detail})`)
}

const src = manifest.sources
check('users count', count(target, 'users') === src.auth.tables.users, `${count(target, 'users')} vs ${src.auth.tables.users}`)
check('tombstones preserved', count(target, 'users', 'anonymised_at IS NOT NULL') === src.auth.checks.users_anonymised, `${count(target, 'users', 'anonymised_at IS NOT NULL')} vs ${src.auth.checks.users_anonymised}`)
check('no Workspace passwords', count(target, 'users', 'email LIKE \'%@newtheatre.org.uk\' AND password IS NOT NULL') === 0, `wiped ${summary.workspaceWiped}, source had ${src.auth.checks.users_workspace_password}`)
check('wipe count matches source', summary.workspaceWiped === src.auth.checks.users_workspace_password, `${summary.workspaceWiped} vs ${src.auth.checks.users_workspace_password}`)
check('totp carried', count(target, 'totp_secrets') === src.auth.tables.totp_secrets, `${count(target, 'totp_secrets')} vs ${src.auth.tables.totp_secrets}`)
check('recovery codes carried', count(target, 'recovery_codes') === src.auth.tables.mfa_recovery_codes, `${count(target, 'recovery_codes')} vs ${src.auth.tables.mfa_recovery_codes}`)
check('no passkeys imported', !JSON.stringify(target.query('SELECT name FROM sqlite_master WHERE name=\'passkeys\'').all()).includes('passkeys') || count(target, 'passkeys') === 0, 'SP-4')
check('grants accounted for', summary.grantsImported + summary.grantsCollapsed + summary.grantsSkipped === src.auth.tables.user_roles, `${summary.grantsImported} imported + ${summary.grantsCollapsed} collapsed + ${summary.grantsSkipped} skipped vs ${src.auth.tables.user_roles}`)

// The old estate's audit history is deliberately left behind (0030): the check is that nothing
// quietly started importing it again.
check(
  'old audit history not imported',
  target.query('SELECT name FROM sqlite_master WHERE name = ?').all('audit_archive').length === 0,
  '0030',
)

// The mapping is what turns the old namespaced roles into this system's vocabulary. A role in use
// with no key silently drops every grant that holds it, which is how this guard came to exist.
const unmapped: string[] = summary.unmappedRoles ?? []
check('every old role in use has a mapping', unmapped.length === 0, unmapped.length ? unmapped.join(', ') : 'all mapped')

// granted_by has no foreign key to catch it, so an old estate id would sit in the live database
// as data (0015).
check(
  'no old estate ids in granted_by',
  count(target, 'role_grants', 'granted_by IS NOT NULL AND granted_by NOT IN (SELECT id FROM users)') === 0,
  `${count(target, 'role_grants', 'granted_by IS NOT NULL')} grants name an officer`,
)

check(
  'every address is lowercase',
  count(target, 'users', 'email != lower(email)') === 0,
  `${summary.emailsLowercased} normalised on import`,
)

// The K-115 guard: the registers were empty when the story was resolved; rows appearing
// before cutover revive the import story rather than being dropped.
check('K-115 guard: incident register still empty', src.proscenium.checks.incident_log === 0, `${src.proscenium.checks.incident_log} rows`)
check('K-115 guard: age-check register still empty', src.proscenium.checks.age_checks === 0, `${src.proscenium.checks.age_checks} rows`)

const exceptions = (await Bun.file(join(OUT, 'exceptions.txt')).text()).trim()
const exceptionCount = exceptions ? exceptions.split('\n').length : 0
notes.push(`${exceptionCount} exceptions listed in out/exceptions.txt (each needs a human decision, none blocks the rehearsal)`)

console.log(notes.join('\n'))
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`\nReconciliation green for dumps of ${manifest.stamp}.`)
