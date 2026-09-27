import { describe, expect, test } from 'bun:test'

// shared/utils shares one auto-import namespace, and server/utils joins it on the server. A clash is
// not refused: whichever name was seen first is kept, with a warning where nobody reads.

const EXPORT = /^export\s+(?:async\s+)?(?:interface|type|function|const|class)\s+(\w+)/gm

async function exportsByName(directories: string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>()
  for (const directory of directories) {
    for (const file of [...new Bun.Glob('*.ts').scanSync({ cwd: directory, onlyFiles: true })].sort()) {
      const source = await Bun.file(`${directory}/${file}`).text()
      for (const [, name] of source.matchAll(EXPORT)) {
        found.set(name!, [...(found.get(name!) ?? []), `${directory}/${file}`])
      }
    }
  }
  return found
}

const clashesIn = async (directories: string[]): Promise<string[]> => [...(await exportsByName(directories))]
  .filter(([, files]) => files.length > 1)
  .map(([name, files]) => `${name}: ${files.join(', ')}`)

describe('one name, one meaning (auto-imports)', () => {
  test('no two files in shared/utils export the same name', async () => {
    expect(await clashesIn(['shared/utils'])).toEqual([])
  })

  // A route auto-importing a name two server files both export gets whichever one Nitro kept,
  // with no error to say it was the wrong one.
  test('no two files across server/utils and shared/utils export the same name', async () => {
    expect(await clashesIn(['server/utils', 'shared/utils'])).toEqual([])
  })

  test('nothing exported shadows a browser global', async () => {
    const shadowed = ['Window', 'Document', 'Event', 'Request', 'Response', 'Headers', 'Location']
    const named = [...(await exportsByName(['shared/utils'])).keys()]
    expect(named.filter(name => shadowed.includes(name))).toEqual([])
  })
})
