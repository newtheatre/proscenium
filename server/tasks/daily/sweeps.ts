// Nightly tidy of rows that have expired unused, and of the accounts whose address was never
// proved (0026, docs/architecture.md, Scheduled tasks).
export default defineTask({
  meta: {
    name: 'daily:sweeps',
    description: 'Tidy lapsed rows, expire unverified accounts, and remind memberships that are running out',
  },
  async run() {
    const before = new Date()
    await sweepExpiredLimits(before)
    const attempts = await sweepExpiredAttempts(before)
    const tokens = await sweepExpiredTokens(before)
    const unverified = await expireUnverifiedAccounts(before)
    const renewals = await remindExpiringMemberships(undefined, before)
    const withdrawnAccessProfiles = await sweepWithdrawnAccessProfiles(before)
    return { result: { attempts, tokens, unverified, renewals, withdrawnAccessProfiles } }
  },
})
