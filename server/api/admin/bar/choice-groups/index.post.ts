import { sql } from 'drizzle-orm'
import { choiceGroupForm } from '#shared/utils/bar'

// Add a choice a variant can offer, such as a spirit's mixer, with its stocked-item options
// (F-113 criterion 2).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const { name, options } = await readValidatedBodyOrThrow(event, choiceGroupForm)

  // One statement for every option named. The list comes from the request and the schema caps
  // it, so the parameter count is bounded by what was sent rather than by what is stored (0003).
  const named = options.map(option => option.itemId)
  const usable = await db.all<{ id: string, name: string, status: string }>(sql`
    SELECT id, name, status FROM bar_items WHERE id IN (${sql.join(named.map(id => sql`${id}`), sql`, `)})
  `)
  if (usable.length !== named.length) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })

  const retired = usable.find(item => item.status === 'RETIRED')
  if (retired) {
    throw createError({
      statusCode: 409,
      statusMessage: `${retired.name} is retired, so it cannot be offered as a choice: put it back or choose another`,
    })
  }

  const id = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.choice-group.created',
    target: `bar-choice-group:${id}`,
    detail: { name, options: options.length },
  })

  // Options and the audit row ride on this transaction's own fresh id, so a losing name never
  // leaves an orphaned group with no options (0001); `changes()` cannot guard several rows.
  const [created] = await db.batch([
    db.all<{ id: string }>(sql`
      INSERT INTO choice_groups (id, name)
      SELECT ${id}, ${name}
      WHERE NOT EXISTS (SELECT 1 FROM choice_groups WHERE name = ${name} COLLATE NOCASE)
      RETURNING id
    `),
    ...options.map((option, index) => db.run(sql`
      INSERT INTO choice_group_items (id, choice_group_id, item_id, qty, sort)
      SELECT ${newId()}, ${id}, ${option.itemId}, ${option.qty}, ${index}
      WHERE EXISTS (SELECT 1 FROM choice_groups WHERE id = ${id})
    `)),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE EXISTS (SELECT 1 FROM choice_groups WHERE id = ${id})
    `),
  ])

  if (created.length === 0) {
    throw createError({ statusCode: 409, statusMessage: `A choice group is already called ${name}` })
  }

  return { ok: true, id }
})
