// Nightly tidy of rows that have expired unused, and of the accounts whose address was never
// proved (0026, docs/architecture.md, Scheduled tasks).
export default defineTask({
  meta: {
    name: 'daily:sweeps',
    description: 'Delete lapsed rate-limit windows, MFA attempts and sign-in tokens, and expire unverified accounts',
  },
  async run() {
    const before = new Date()
    await sweepExpiredLimits(before)
    const attempts = await sweepExpiredAttempts(before)
    const tokens = await sweepExpiredTokens(before)
    const unverified = await expireUnverifiedAccounts(before)
    return { result: { attempts, tokens, unverified } }
  },
})
