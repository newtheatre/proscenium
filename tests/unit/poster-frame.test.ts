import { describe, expect, test } from 'bun:test'

// No show has artwork until poster upload exists, so one component draws both the art and its
// absence: the real poster is then a one-file change (J-111 criterion 6).

const FRAME = 'app/components/PosterFrame.vue'

async function appVueFiles(): Promise<string[]> {
  return [...new Bun.Glob('**/*.vue').scanSync({ cwd: 'app', onlyFiles: true })]
    .map(path => `app/${path.replaceAll('\\', '/')}`)
    .sort()
}

describe('the poster frame is the one place artwork is drawn (J-111)', () => {
  test('the frame carries both states, the art and its absence', async () => {
    const source = await Bun.file(FRAME).text()
    expect(source).toContain('data-test="poster-art"')
    expect(source).toContain('data-test="poster-none"')
    expect(source).toContain('nnt-headline')
  })

  test('nothing else in the app renders a show\'s poster', async () => {
    const offenders: string[] = []
    for (const file of await appVueFiles()) {
      if (file === FRAME) continue
      const source = await Bun.file(file).text()
      if (source.includes('posterUrl') && source.includes('<NuxtImg')) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('the frame is actually used, so the rule above cannot pass by drawing nothing', async () => {
    const users: string[] = []
    for (const file of await appVueFiles()) {
      if (file === FRAME) continue
      if ((await Bun.file(file).text()).includes('<PosterFrame')) users.push(file)
    }
    expect(users.length).toBeGreaterThan(0)
  })

  // The artless frame seeds its two hues from the slug, so a caller passing the title instead
  // would give one show different colours on the listing and on its own page.
  test('every caller seeds the frame from the slug', async () => {
    const offenders: string[] = []
    for (const file of await appVueFiles()) {
      if (file === FRAME) continue
      const source = await Bun.file(file).text()
      for (const use of source.matchAll(/<PosterFrame\b([\s\S]*?)\/>/g)) {
        if (!/:slug=/.test(use[1] ?? '')) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  // Vue's client compiler drops a comment between v-if and v-else roots; the server renderer keeps
  // it and renders a fragment, which takes no fallthrough attributes (issue 1022).
  test('nothing but whitespace sits between the two roots of the frame', async () => {
    const source = await Bun.file(FRAME).text()
    const between = source.match(/<\/div>\s*([\s\S]*?)<div\s+v-else/)
    expect(between).not.toBeNull()
    expect(between![1]!.trim()).toBe('')
  })
})
