// Nightly tidy of rows that have expired unused, of the accounts whose address was never proved,
// and of the grants that lapsed (0026, A-119, docs/architecture.md, Scheduled tasks).
export default defineTask({
  meta: {
    name: 'daily:sweeps',
    description: 'Tidy lapsed rows, expire unverified accounts, and warn what is about to run out',
  },
  async run() {
    const before = new Date()
    await sweepExpiredLimits(before)
    const attempts = await sweepExpiredAttempts(before)
    const tokens = await sweepExpiredTokens(before)
    const unverified = await expireUnverifiedAccounts(before)
    const renewals = await remindExpiringMemberships(undefined, before)
    const withdrawnAccessProfiles = await sweepWithdrawnAccessProfiles(before)
    const backstage = await purgeStaleMessages(before)
    const roleLapses = await sweepRoleLapses(undefined, before)
    const sendLog = await pruneNotificationLog(undefined, before)
    const digestEntries = await pruneOrphanedDigestEntries()
    return { result: { attempts, tokens, unverified, renewals, withdrawnAccessProfiles, backstage, roleLapses, sendLog, digestEntries } }
  },
})
