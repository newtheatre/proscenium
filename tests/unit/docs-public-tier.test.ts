import { describe, expect, test } from 'bun:test'
import { HELP_ROOT, needsSession } from '#shared/utils/docs-paths'
import { PUBLIC_NAV } from '#shared/utils/site-nav'

// J-109 criterion 6, 0093: public help is its own collection, readable signed out, and the
// operator collection's gate is untouched by it.

async function helpPages(): Promise<{ file: string, source: string }[]> {
  const found: { file: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.md').scanSync({ cwd: HELP_ROOT, onlyFiles: true })) {
    const file = `${HELP_ROOT}/${entry}`.replace(/\\/g, '/')
    found.push({ file, source: await Bun.file(file).text() })
  }
  return found.sort((a, b) => a.file.localeCompare(b.file))
}

describe('the operator collection still needs a session (0076)', () => {
  test('its dump and its query route are gated', () => {
    expect(needsSession('/dump.docs.sql')).toBe(true)
    expect(needsSession('/__nuxt_content/docs/sql_dump.txt')).toBe(true)
    expect(needsSession('/__nuxt_content/docs/query')).toBe(true)
  })
})

describe('the public tier is readable signed out (0093)', () => {
  test('its dump and its query route are not gated', () => {
    expect(needsSession('/dump.help.sql')).toBe(false)
    expect(needsSession('/__nuxt_content/help/sql_dump.txt')).toBe(false)
    expect(needsSession('/__nuxt_content/help/query')).toBe(false)
  })

  test('neither is the editorial collection, nor an ordinary page', () => {
    expect(needsSession('/__nuxt_content/content/sql_dump.txt')).toBe(false)
    expect(needsSession('/help')).toBe(false)
    expect(needsSession('/docs')).toBe(false)
  })

  test('is its own collection, and the editorial one does not also carry its pages', async () => {
    const config = await Bun.file('content.config.ts').text()
    expect(config).toMatch(/help:\s*defineCollection\(/)
    expect(config).toContain('source: \'help/**\'')
    expect(config).toMatch(/exclude:\s*\[[^\]]*'help\/\*\*'/)
  })

  test('the help route declares no middleware', async () => {
    const page = await Bun.file('app/pages/help/[...slug].vue').text()
    expect(page).toContain('queryCollection(\'help\')')
    expect(page).not.toMatch(/definePageMeta\(\{[\s\S]*?\bmiddleware\b/)
  })

  test('the public shell links to it', () => {
    expect(PUBLIC_NAV.map(entry => entry.to)).toContain('/help')
  })

  test('has the three pages a visitor asks for', async () => {
    const titles = (await helpPages()).map(page => page.source.match(/^title:\s*(.+)$/m)?.[1]?.trim())
    expect(titles).toEqual(expect.arrayContaining(['Do I need an account?', 'Creating an account', 'Signing in']))
  })

  test('every page is marked public, and none links into the signed-in documentation', async () => {
    const pages = await helpPages()
    expect(pages.length).toBeGreaterThanOrEqual(4)
    expect(pages.filter(page => !/^audience:\s*public\s*$/m.test(page.source)).map(page => page.file)).toEqual([])
    expect(pages.filter(page => /\]\(\/docs\b/.test(page.source)).map(page => page.file)).toEqual([])
  })
})
