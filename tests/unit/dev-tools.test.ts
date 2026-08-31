import { describe, expect, test } from 'bun:test'
import { PERSONAS, PERSONA_PASSWORD } from '#shared/utils/personas'

// The developer tools sign in without a password, so the guarantee that matters is that they are
// not in a build at all (K-124 criterion 3).

describe('the developer tools do not ship', () => {
  test('nuxt.config leaves them out of a production build', async () => {
    const config = await Bun.file('nuxt.config.ts').text()
    expect(config).toContain('ignore:')
    for (const path of ['app/pages/dev.vue', 'server/api/dev/**', 'api/dev/**']) {
      expect(config).toContain(path)
    }
  })

  // Run after a build, this is the check that counts. Skipped when there is nothing built yet,
  // because a unit suite must not depend on a build having happened.
  test('a built output contains neither the route nor the personas', async () => {
    const built = Bun.file('.output/server/index.mjs')
    if (!await built.exists()) return

    const chunks = [...new Bun.Glob('**/*.{mjs,js}').scanSync({ cwd: '.output', onlyFiles: true })]
    const offenders: string[] = []
    for (const chunk of chunks) {
      const source = await Bun.file(`.output/${chunk}`).text()
      if (source.includes('sign-in-as') || source.includes(PERSONA_PASSWORD)) offenders.push(chunk)
    }
    expect(offenders).toEqual([])
  })
})

describe('the personas cover the states that are easy to forget', () => {
  test('there is one for every shape an account can be in', () => {
    expect(new Set(PERSONAS.map(persona => persona.shape))).toEqual(new Set(['full', 'guest', 'tombstone']))
  })

  test('every persona says what it is for, and none shares an address', () => {
    for (const persona of PERSONAS) expect(persona.describes.length).toBeGreaterThan(20)
    expect(new Set(PERSONAS.map(persona => persona.email)).size).toBe(PERSONAS.length)
  })

  // A password in the repository is only ever acceptable because this one cannot reach production.
  test('the shared password is obviously a development one', () => {
    expect(PERSONA_PASSWORD).toContain('development')
  })
})
