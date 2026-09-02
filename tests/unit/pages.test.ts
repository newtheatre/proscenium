import { describe, expect, test } from 'bun:test'

// A page file beside a directory of the same name becomes that directory's parent route, and a
// parent without <NuxtPage /> renders itself instead of its children, silently.

const PAGES = 'app/pages'

const files = [...new Bun.Glob('**/*.vue').scanSync({ cwd: PAGES })]

describe('the page routes', () => {
  test('there are pages, so a broken glob cannot pass by finding none', () => {
    expect(files.length).toBeGreaterThan(3)
  })

  test('a page beside a directory of its own name renders its children', async () => {
    // Every ancestor, not just the immediate parent: a page beside a directory whose only files sit
    // deeper is the same trap, and counting parents alone let one through.
    const directories = new Set(files.flatMap((file) => {
      const parts = file.split('/').slice(0, -1)
      return parts.map((_, depth) => parts.slice(0, depth + 1).join('/'))
    }).filter(Boolean))

    const shadowing: string[] = []
    for (const file of files) {
      const asDirectory = file.replace(/\.vue$/, '')
      if (!directories.has(asDirectory)) continue
      const source = await Bun.file(`${PAGES}/${file}`).text()
      if (!source.includes('<NuxtPage')) shadowing.push(file)
    }

    expect(shadowing).toEqual([])
  })
})
