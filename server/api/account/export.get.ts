// Everything held about you, in one action and one pass (A-124). Downloaded from an authenticated
// session and never emailed: an attachment is a copy nobody can take back.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const bundle = await buildBundle(account)

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'account.exported',
    target: `user:${account.id}`,
    detail: { sections: Object.keys(bundle.sections).length },
  }))

  const stamp = new Date().toISOString().slice(0, 10)
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="nnt-data-${stamp}.json"`)
  return bundle
})
