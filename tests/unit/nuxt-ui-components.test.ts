import { describe, expect, test } from 'bun:test'

// An unresolved component warns in the dev server and is a silently missing element in a build:
// nothing fails, and the page renders slightly wrong. Nuxt UI 4 renamed several.

const LIBRARY = 'node_modules/@nuxt/ui/dist/runtime/components'
const USED = /<(U[A-Z]\w*)/g

// Prose components come from @nuxt/content rather than from Nuxt UI, and are resolved by it.
const ELSEWHERE = /^UProse/

async function componentsInApp(): Promise<Map<string, string[]>> {
  const used = new Map<string, string[]>()
  for (const file of [...new Bun.Glob('**/*.vue').scanSync({ cwd: 'app', onlyFiles: true })].sort()) {
    const source = await Bun.file(`app/${file}`).text()
    for (const [, name] of source.matchAll(USED)) {
      used.set(name!, [...(used.get(name!) ?? []), file])
    }
  }
  return used
}

function libraryComponents(): Set<string> {
  return new Set([...new Bun.Glob('*.vue').scanSync({ cwd: LIBRARY, onlyFiles: true })]
    .map(file => `U${file.replace('.vue', '')}`))
}

describe('every Nuxt UI component used is one that exists', () => {
  test('nothing references a component the library does not have', async () => {
    const available = libraryComponents()
    const ours = new Set([...new Bun.Glob('**/*.vue').scanSync({ cwd: 'app/components', onlyFiles: true })]
      .map(file => file.replace(/\.vue$/, '').split('/').pop()!))

    const missing: string[] = []
    for (const [name, files] of await componentsInApp()) {
      if (ELSEWHERE.test(name) || available.has(name) || ours.has(name)) continue
      missing.push(`${name}: ${files.join(', ')}`)
    }

    expect(missing).toEqual([])
  })

  // If the glob ever stops finding the library, the check above passes over nothing and says so.
  test('the library was actually found', () => {
    expect(libraryComponents().size).toBeGreaterThan(50)
  })
})
