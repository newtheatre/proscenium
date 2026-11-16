// The browser tests say who is asking in an X-Test-Actor header holding the actor as JSON. This
// file exists only in the gallery, which only a build made for those tests includes.
import { defineNitroPlugin } from 'nitropack/runtime'
import { getHeader } from 'h3'
import { setAccessProvider, type Actor } from '#kit'

export default defineNitroPlugin(() => {
  setAccessProvider({
    async actor(event) {
      const header = getHeader(event, 'x-test-actor')
      return header ? JSON.parse(header) as Actor : { kind: 'anonymous' }
    },
  })
})
