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
check('audit archive complete', count(target, 'audit_archive') === src.auth.tables.audit_log + src.training.tables.audit_log, `${count(target, 'audit_archive')} vs ${src.auth.tables.audit_log + src.training.tables.audit_log}`)

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
