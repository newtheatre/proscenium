import { londonDay, membershipState } from '#shared/utils/membership'
import type { Viewer } from '#shared/utils/abilities'

// Resolves the viewer an ability is checked against. Sorted after 0.secrets-store, which must
// still run first, and lazy on purpose: a public request must not pay for the queries below.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.$authorization = {
      resolveServerUser: async <User extends Record<string, unknown>>(): Promise<User | null> => {
        const account = await currentAccount(event)
        if (!account) return null
        const [term, graceDays] = await Promise.all([
          longestTerm(account.id),
          configValue(event, 'MEMBERSHIP_GRACE_DAYS'),
        ])
        const viewer: Viewer = {
          id: account.id,
          permissions: [...permissionsFor(await liveGrants(account.id), new Date())],
          onShiftTonight: false,
          leadsDepartment: (await liveLeads(account.id)).length > 0,
          isTrainer: (await trainerStandingOf(account.id, londonToday())).trainer,
          membershipState: membershipState(term, londonDay(new Date()), graceDays),
        }
        return viewer as unknown as User
      },
    }
  })
})
