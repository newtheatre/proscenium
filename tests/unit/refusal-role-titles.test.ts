import { describe, expect, test } from 'bun:test'
import { saysRole } from '#shared/utils/roles'

// A refusal names a role by its title (copy-style section 4), and a route's noSuch() names the
// thing the screen calls it: the Closures screen never says "blackout" (K-128, issue 1154 item 8).

async function serverFiles(): Promise<{ path: string, source: string }[]> {
  const files: { path: string, source: string }[] = []
  for (const dir of ['server/api', 'server/utils']) {
    for (const entry of new Bun.Glob('**/*.ts').scanSync({ cwd: dir, onlyFiles: true })) {
      const path = `${dir}/${entry}`
      files.push({ path, source: await Bun.file(path).text() })
    }
  }
  return files
}

// Every quoted string a route could hand to a reader; comment lines are dropped first.
const READER_STRING = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
const withoutComments = (source: string): string => source.split('\n').filter(line => !line.trim().startsWith('//')).join('\n')

describe('a refusal names the role by its title (K-128, copy-style section 4)', () => {
  test('no refusal calls the IT Manager an administrator', async () => {
    const offenders: string[] = []
    for (const file of await serverFiles()) {
      for (const match of withoutComments(file.source).matchAll(READER_STRING)) {
        const said = match[2] ?? ''
        if (/administrator/i.test(said)) offenders.push(`${file.path}: ${said}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('the title the refusals use is the one the register shows', () => {
    expect(saysRole('ADMIN')).toBe('IT Manager')
  })

  test('a closure the screen no longer has is refused as a closure, not a blackout', async () => {
    const offenders: string[] = []
    for (const file of await serverFiles()) {
      for (const match of withoutComments(file.source).matchAll(READER_STRING)) {
        const said = match[2] ?? ''
        // A sentence, or the noun noSuch() turns into one; an import path or an audit code is not read.
        const reaches = /^[A-Z][a-z].* /.test(said) || file.source.includes(`noSuch('${said}')`)
        if (reaches && /blackout/i.test(said)) offenders.push(`${file.path}: ${said}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// The words the console review left behind (issue 1151 item 12, issue 1154 item 8): nothing is
// done by "the system", a queued send is queued, and revenue given away is forgone.
async function appFiles(): Promise<{ path: string, source: string }[]> {
  const files: { path: string, source: string }[] = []
  for (const dir of ['app/pages', 'app/components', 'shared/utils']) {
    for (const entry of new Bun.Glob('**/*.{vue,ts}').scanSync({ cwd: dir, onlyFiles: true })) {
      const path = `${dir}/${entry}`
      files.push({ path, source: await Bun.file(path).text() })
    }
  }
  return files
}

describe('the last three words the review left (K-128)', () => {
  test('no refusal says the system did or did not do something', async () => {
    const offenders: string[] = []
    for (const file of await serverFiles()) {
      for (const match of withoutComments(file.source).matchAll(READER_STRING)) {
        const said = match[2] ?? ''
        if (/^[A-Z][a-z].* /.test(said) && /\bthe system\b/i.test(said)) offenders.push(`${file.path}: ${said}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('a send waiting to go is queued, and revenue given away is forgone', async () => {
    const offenders: string[] = []
    for (const file of await appFiles()) {
      for (const match of withoutComments(file.source).matchAll(READER_STRING)) {
        const said = match[2] ?? ''
        // A label or a sentence, never a key, a route or a test hook.
        // One line: a span across lines is a regex literal or a template, not a label.
        const reaches = !said.includes('\n') && (said.includes(' ') || /^[A-Z]/.test(said))
        if (reaches && /\benqueued\b|\bforegone\b/i.test(said)) offenders.push(`${file.path}: ${said}`)
      }
      if (!file.path.endsWith('.vue')) continue
      for (const text of file.source.matchAll(/>([^<{\n]*\bforegone\b[^<{\n]*)</gi)) offenders.push(`${file.path}: ${text[1]?.trim()}`)
    }
    expect(offenders).toEqual([])
  })
})
