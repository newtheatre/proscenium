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

// The dev-mode guard is what keeps a development send off a provider, and it is read from a
// build-time flag. Written as anything but the bare literal, that flag is silently undefined.
describe('development is something the server can still tell it is in', () => {
  const READ_THROUGH_A_CAST = /\(\s*import\.meta\s+as[^)]*\)\s*\.\s*\w+/

  test('nothing reads import.meta through a type assertion', async () => {
    const offenders: string[] = []
    for (const directory of ['server', 'app', 'shared']) {
      for (const path of new Bun.Glob('**/*.{ts,vue}').scanSync({ cwd: directory, onlyFiles: true })) {
        const file = `${directory}/${path}`
        if (READ_THROUGH_A_CAST.test(await Bun.file(file).text())) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  test('the notification centre reads the flag the bundler replaces', async () => {
    const source = await Bun.file('server/utils/notify.ts').text()
    expect(source).toContain('Boolean(import.meta.dev)')
  })

  // Proof rather than inference, when there is a dev bundle to read: the assertion form compiled
  // to `globalThis._importMeta_.dev`, and `_importMeta_` is only ever `{ url, env }`.
  test('the dev bundle inlines the flag rather than reaching for _importMeta_', async () => {
    const bundle = Bun.file('.nuxt/dev/index.mjs')
    if (!await bundle.exists()) return

    // A boolean, not the bundle: a failed `toContain` on four megabytes prints four megabytes.
    expect((await bundle.text()).includes('_importMeta_.dev')).toBe(false)
  })

  // The tools read the mailbox back, so the two must not spell the path twice (K-124).
  test('the writer and the dev tools share one mailbox path', async () => {
    const writer = await Bun.file('server/utils/mailbox.ts').text()
    const tools = await Bun.file('server/utils/dev.ts').text()
    expect(writer).toContain('export const MAILBOX')
    expect(tools).toContain('from \'./mailbox\'')
    expect(tools).not.toContain('const MAILBOX =')
  })
})
