import { describe, expect, test } from 'bun:test'

// A show has no artwork until poster upload exists (docs/known-issues.md), so every public
// surface draws the same no-art state. Keeping it in one component is what makes the real
// poster a one-file change later (J-111 criterion 6).

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
})
