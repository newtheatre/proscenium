// Every change to a setting, newest first (settings build brief, "History and revert"), filtered by
// setting, module, page and person. The whole history needs core.audit.view, and each search is
// recorded; one setting's history is open to whoever may change that setting, for the line under it.
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { can, defineRoute, inAccountScope, refuse, useDb } from '#kit'
import { useRegistry } from '#kit/registry'
import { currentKey } from '#kit/settings-store'
import { changeView, type ChangeRow } from '../../../settings/history'

const MOST_ROWS = 50 // not-policy: one page of history

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({
    key: z.string().max(200).optional(), // not-policy: a sane length for a key
    module: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(), // not-policy: the pattern of a module id
    page: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/).optional(), // not-policy: <module>.<page>
    actor: z.string().max(40).optional(), // not-policy: an account id
    before: z.string().regex(/^\d+:[a-z]{3}_[0-9a-z]+$/).optional(), // not-policy: <at>:<id>, the last row of the page before
  }),
}, async (_event, { input, actor, unit }) => {
  const registry = useRegistry()
  const key = input.key === undefined ? undefined : currentKey(input.key)
  const entry = key ? registry.settings.get(key)?.entry : undefined
  if (input.key !== undefined && !entry) return refuse('core.setting.unknown', `There is no setting called ${input.key}.`, { status: 404 })
  const own = entry && (await can(actor, entry.change as never, undefined, { fresh: false })).allowed
  const audit = await can(actor, 'core.audit.view' as never)
  if (!own && !audit.allowed) return refuse('core.access.denied', 'You do not have permission to do this.', { status: 403, remedy: 'Ask an administrator for this permission.' })

  // The settings asked about, with the old keys of any that were renamed.
  const keys = [...registry.settings].filter(([k, s]) =>
    (key === undefined || k === key)
    && (input.module === undefined || s.module === input.module)
    && (input.page === undefined || registry.settingHomes.get(k)?.page === input.page)).map(([k]) => k)
  for (const [old, now] of registry.settingAliases) if (keys.includes(now)) keys.push(old)
  const [beforeAt, beforeId] = input.before ? [Number(input.before.split(':')[0]), input.before.split(':')[1]!] : [undefined, undefined]
  // A person's changes include those made under an account since merged into theirs.
  const rows = await useDb().all<ChangeRow>(sql`
    SELECT c.id, c.key, c.old_value, c.new_value, c.reason, c.at, c.actor, coalesce(a.preferred_name, a.name) AS actor_name
      FROM core_setting_changes c LEFT JOIN core_accounts a ON a.id = c.actor
     WHERE c.key IN (SELECT value FROM json_each(${JSON.stringify(keys)}))
       AND ${input.actor ? inAccountScope('c.actor', input.actor) : sql`1`}
       AND ${beforeAt === undefined ? sql`1` : sql`(c.at < ${beforeAt} OR (c.at = ${beforeAt} AND c.id < ${beforeId}))`}
     ORDER BY c.at DESC, c.id DESC LIMIT ${MOST_ROWS + 1}`)
  if (!own) unit.audit({ action: 'read', ability: 'core.audit.view', detail: { settings: keys.length } })
  const page = rows.slice(0, MOST_ROWS)
  const last = page.at(-1)
  return {
    changes: await Promise.all(page.map(row => changeView(row, actor))),
    next: rows.length > MOST_ROWS && last ? `${last.at}:${last.id}` : null,
  }
})
