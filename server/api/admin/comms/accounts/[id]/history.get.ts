// One person's send history: types, dates and outcomes, to answer "did the reminder go out"
// without a message body ever naming somebody else (H-106 criterion 3). Every view is audited.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'comms.operations')
  const id = getRouterParam(event, 'id') ?? ''

  const account = await findById(id)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })

  const { page, pageSize } = await getValidatedQueryOrThrow(event, pageQuery)

  const [items, total] = await Promise.all([
    personHistory(id, pageSize, offsetFor(page, pageSize)),
    countPersonHistory(id),
  ])

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'notifications.history.viewed',
    target: `user:${id}`,
    detail: { rows: items.length },
  }))

  return {
    account: { id: account.id, name: account.name },
    history: envelope(items, total, page, pageSize),
  }
})
