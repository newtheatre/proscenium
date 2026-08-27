// Nightly tidy of short-lived rows that are already spent by claim: what is left here has simply
// expired unused (docs/architecture.md, Scheduled tasks).
export default defineTask({
  meta: {
    name: 'daily:sweeps',
    description: 'Delete lapsed rate-limit windows, MFA attempts and unclaimed sign-in tokens',
  },
  async run() {
    const before = new Date()
    await sweepExpiredLimits(before)
    const attempts = await sweepExpiredAttempts(before)
    const tokens = await sweepExpiredTokens(before)
    return { result: { attempts, tokens } }
  },
})
