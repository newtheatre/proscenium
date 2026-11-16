// The browser tests say who is asking in an X-Test-Actor header holding the actor as JSON. This
// file exists only in the gallery, which only a build made for those tests includes. A request
// without the header goes to the provider already installed (identity's), so the gallery build
// still checks real sessions and the origin of changes.
import { defineNitroPlugin } from 'nitropack/runtime'
import { getHeader } from 'h3'
import { setAccessProvider, type Actor } from '#kit'
import { useAccessProvider } from '#kit/access'

export default defineNitroPlugin(() => {
  const installed = useAccessProvider()
  const tested = new WeakSet<Actor>()
  setAccessProvider({
    async actor(event) {
      const header = getHeader(event, 'x-test-actor')
      if (!header) return installed.actor(event)
      const actor = JSON.parse(header) as Actor
      tested.add(actor)
      return actor
    },
    grants: async actor => tested.has(actor) ? actor.grants ?? [] : installed.grants?.(actor) ?? [],
    factAbilities: async () => installed.factAbilities?.() ?? {},
  })
})
