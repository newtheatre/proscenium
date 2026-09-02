import type { Viewer } from '#shared/utils/abilities'

// Resolves the viewer an ability is checked against. Sorted after 0.secrets-store, which must
// still run first, and lazy on purpose: a public request must not pay for the queries below.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.$authorization = {
      resolveServerUser: async <User extends Record<string, unknown>>(): Promise<User | null> => {
        const account = await currentAccount(event)
        if (!account) return null
        const viewer: Viewer = {
          id: account.id,
          permissions: [...permissionsFor(await liveGrants(account.id), new Date())],
          onShiftTonight: false,
          leadsDepartment: (await liveLeads(account.id)).length > 0,
          isTrainer: (await trainerStandingOf(account.id, londonToday())).trainer,
        }
        return viewer as unknown as User
      },
    }
  })
})
