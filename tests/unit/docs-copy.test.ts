import { describe, expect, test } from 'bun:test'
import { DOCS_ROOT } from '#shared/utils/docs-paths'
import { AUDIT_ACTION_NAMES } from '#shared/utils/audit-actions'
import { CONFIG_KEY_NAMES, isConfigKey } from '#shared/utils/config'
import { PERMISSIONS } from '#shared/utils/roles'

// The wiki is read by whoever is on shift, so it reads in their words (J-109, issue 1154 items 3
// and 4). The machine's own vocabulary is held here as public-copy.test.ts holds the public shell's.

// The send log shows a message's type against every line, so the page that decodes one names
// them, as Settings names a key. It is the only page that may, and it names nothing else.
const CATALOGUE_PAGE = `${DOCS_ROOT}/11.communications/3.what-the-theatre-sends.md`

// Settings is the one screen that shows a key, in the font it stores it in, so the page for it
// names the row the reader is looking at (copy-style section 10, 0012).
const SETTINGS_PAGE = `${DOCS_ROOT}/12.system/1.settings.md`

async function pages(): Promise<{ file: string, source: string }[]> {
  const found: { file: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.md').scanSync({ cwd: DOCS_ROOT, onlyFiles: true })) {
    const file = `${DOCS_ROOT}/${entry}`.replace(/\\/g, '/')
    found.push({ file, source: await Bun.file(file).text() })
  }
  return found.sort((a, b) => a.file.localeCompare(b.file))
}

// A policy token is the sanctioned way to quote a configured number, so it is not prose.
function withoutTokens(source: string): string {
  return source.replace(/\{\{\s*[A-Z0-9_]+\s*\}\}/g, ' ')
}

// A page quotes a screen word for word, in quotation marks for a refusal and in bold for a
// control or a column, so this reads past both and holds the page's own prose to the rules.
function withoutQuotedScreens(source: string): string {
  const blanked = (quoted: string): string => quoted.replace(/[^\n]/g, ' ')
  return source
    .replace(/\*\*"[\s\S]*?"\*\*/g, blanked)
    .replace(/\*\*[A-Z][A-Za-z0-9 '-]{0,30}\*\*/g, blanked)
}

function whole(name: string): RegExp {
  return new RegExp(`(^|[^a-z0-9.-])${name.replace(/[.-]/g, '\\$&')}($|[^a-z0-9.-])`)
}

function offending(found: { file: string, source: string }[], names: readonly string[], read: (source: string) => string = source => source): string[] {
  const problems: string[] = []
  for (const page of found) {
    const source = read(page.source)
    const named = names.filter(name => whole(name).test(source))
    if (named.length) problems.push(`${page.file}  ${named.join(', ')}`)
  }
  return problems
}

function lines(found: { file: string, source: string }[], pattern: RegExp): string[] {
  const problems: string[] = []
  for (const page of found) {
    page.source.split('\n').forEach((line, index) => {
      if (pattern.test(line)) problems.push(`${page.file}:${index + 1}  ${line.trim()}`)
    })
  }
  return problems
}

describe('no page shows the estate\'s own vocabulary (issue 1154 items 3 and 4)', () => {
  test('no page names a permission', async () => {
    const found = (await pages()).filter(page => page.file !== CATALOGUE_PAGE)
    // A floor, so an empty glob cannot pass as nothing to check.
    expect(found.length).toBeGreaterThan(80)
    expect(offending(found, PERMISSIONS)).toEqual([])
  })

  test('no page names an audit action', async () => {
    const found = (await pages()).filter(page => page.file !== CATALOGUE_PAGE)
    expect(offending(found, AUDIT_ACTION_NAMES)).toEqual([])
  })

  test('no page names a configuration key outside a policy token', async () => {
    const found = (await pages()).filter(page => page.file !== SETTINGS_PAGE)
    expect(offending(found, CONFIG_KEY_NAMES, withoutTokens)).toEqual([])
  })

  test('no page names a role or an enum by its stored value', async () => {
    const shouted = /`[A-Z][A-Z0-9_]{2,}`/
    const allowed = (line: string): boolean =>
      [...line.matchAll(/`([A-Z][A-Z0-9_]{2,})`/g)].every(match => isConfigKey(match[1]!))
    const found = (await pages()).map(page => page.file === SETTINGS_PAGE
      ? { ...page, source: page.source.split('\n').filter(line => !allowed(line)).join('\n') }
      : page)
    expect(lines(found, shouted)).toEqual([])
  })

  test('no page cites a decision record or a story', async () => {
    expect(lines(await pages(), /\(\s*0\d{3}\b|\b0\d{3}\s*\)|\b[A-Z]-1\d{2}\b|\b[A-Z]-2\d{2}\b/)).toEqual([])
  })
})

describe('no page narrates the machine (copy-style section 10)', () => {
  async function prose(): Promise<{ file: string, source: string }[]> {
    return (await pages()).map(page => ({ ...page, source: withoutQuotedScreens(page.source) }))
  }

  test('nothing is done by "the system"', async () => {
    expect(lines(await prose(), /\bthe system\b/i)).toEqual([])
  })

  test('none of the machine\'s own words reach a page', async () => {
    const BANNED = /\b(append-only|the database|on the server|in one write|deploy(s|ed|ing)?|sweeps?|swept|minted|rate limited|forged|purged|enumeration-safe|tombstones?|ordinals?|enqueued|snapshotted|the estate|postures?|shells?|chrome)\b/i
    expect(lines(await prose(), BANNED)).toEqual([])
  })

  test('no page explains itself', async () => {
    expect(lines(await prose(), /\bbecause\b|\bso that\b|\bwhich is why\b|\bon purpose\b/i)).toEqual([])
  })
})
