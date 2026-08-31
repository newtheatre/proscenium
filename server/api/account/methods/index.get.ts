// Every way this account can sign in, and which of them may be taken away.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  return { methods: await listMethods(account) }
})
