// Withdraw your open claim. Idempotent, and withdrawing frees the next claim (criterion 1).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const withdrawn = await withdrawOpenClaim(account.id, Math.floor(Date.now() / 1000))
  return { ok: true, withdrawn }
})
