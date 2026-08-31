import { describe, expect, test } from 'bun:test'

// Everything in shared/utils shares one auto-import namespace. Nuxt does not refuse a clash: it
// keeps whichever name it saw first and drops the other, warning where nobody reads.

const EXPORT = /^export\s+(?:async\s+)?(?:interface|type|function|const|class)\s+(\w+)/gm

async function exportsByName(): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>()
  for (const file of [...new Bun.Glob('*.ts').scanSync({ cwd: 'shared/utils', onlyFiles: true })].sort()) {
    const source = await Bun.file(`shared/utils/${file}`).text()
    for (const [, name] of source.matchAll(EXPORT)) {
      found.set(name!, [...(found.get(name!) ?? []), file])
    }
  }
  return found
}

describe('one name, one meaning (auto-imports)', () => {
  test('no two files in shared/utils export the same name', async () => {
    const clashes = [...(await exportsByName())]
      .filter(([, files]) => files.length > 1)
      .map(([name, files]) => `${name}: ${files.join(', ')}`)

    expect(clashes).toEqual([])
  })

  test('nothing exported shadows a browser global', async () => {
    const shadowed = ['Window', 'Document', 'Event', 'Request', 'Response', 'Headers', 'Location']
    const named = [...(await exportsByName()).keys()]
    expect(named.filter(name => shadowed.includes(name))).toEqual([])
  })
})
