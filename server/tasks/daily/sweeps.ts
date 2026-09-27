// Nightly tidy of rows that have expired unused, of the accounts whose address was never proved,
// and of the grants that lapsed; the membership notices (0026, A-119, A-130, docs/architecture.md).
export default defineTask({
  meta: {
    name: 'daily:sweeps',
    description: 'Tidy lapsed rows, expire unverified accounts, and warn what is about to run out',
  },
  async run() {
    const before = new Date()
    // Independent steps: one that fails is logged and the rest still run, then the task fails.
    const result = await runEachStep('daily:sweeps', {
      limits: () => sweepExpiredLimits(before),
      attempts: () => sweepExpiredAttempts(before),
      tokens: () => sweepExpiredTokens(before),
      unverified: () => expireUnverifiedAccounts(before),
      renewals: () => remindExpiringMemberships(undefined, before),
      waitingClaims: () => remindWaitingClaims(undefined, before),
      withdrawnAccessProfiles: () => sweepWithdrawnAccessProfiles(before),
      backstage: () => purgeStaleMessages(before),
      roleLapses: () => sweepRoleLapses(undefined, before),
      sendLog: () => pruneNotificationLog(undefined, before),
      digestEntries: () => pruneOrphanedDigestEntries(),
    })
    const { limits: _, ...counts } = result
    return { result: counts }
  },
})
