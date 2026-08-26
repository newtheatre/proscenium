import { describe, expect, test } from 'bun:test'

// The design language's own rule: if it is not a token, it is not in the system (0021).
// theme.css is the one file allowed raw values, because it defines the tokens.
const TOKEN_SOURCE = 'app/assets/css/theme.css'
const HEX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi

async function appFiles(): Promise<string[]> {
  const glob = new Bun.Glob('**/*.{vue,ts,css}')
  return [...glob.scanSync({ cwd: 'app', onlyFiles: true })]
    .map(path => `app/${path}`)
    .filter(path => path !== TOKEN_SOURCE)
    .sort()
}

describe('design language (0021)', () => {
  test('no raw hex colours outside the token source', async () => {
    const offenders: string[] = []
    for (const file of await appFiles()) {
      const source = await Bun.file(file).text()
      source.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(HEX)) {
          offenders.push(`${file}:${index + 1}  ${match[0]}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  test('the token source defines the three brand scales', async () => {
    const theme = await Bun.file(TOKEN_SOURCE).text()
    for (const scale of ['--color-purple-600', '--color-gold-400', '--color-ash-950']) {
      expect(`${scale}: ${theme.includes(scale)}`).toBe(`${scale}: true`)
    }
  })

  test('the fonts are self-hosted, with no Google Fonts request', async () => {
    const theme = await Bun.file(TOKEN_SOURCE).text()
    expect(theme).toContain('@fontsource-variable/')
    expect(theme).not.toContain('fonts.googleapis.com')
  })
})
