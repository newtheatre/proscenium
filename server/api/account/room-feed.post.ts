// Mint a calendar feed URL, replacing any the account already had.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const token = await issueFeedToken(account.id)

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'account.calendar-feed.issued',
    target: `user:${account.id}`,

  }))

  // Returned once, in the response that minted it: the plaintext is nowhere else.
  return { url: `${useRuntimeConfig(event).public.baseURL}/rooms/feed/${token}/calendar.ics` }
})
