import { describe, expect, test } from 'bun:test'
import { scopeOf } from '../../scripts/lib/ci-scope'

const EVERYTHING = { app: true, e2e: 'all', suites: [] }

describe('a change to documentation alone reaches nothing that runs (0110)', () => {
  test('engineering documents and root Markdown skip the application gates and every suite', () => {
    expect(scopeOf(['docs/decisions/0110-ci.md', 'docs/architecture.md', 'README.md', 'CONTRIBUTING.md']))
      .toEqual({ app: false, e2e: 'none', suites: [] })
  })

  test('a picture under docs is documentation too', () => {
    expect(scopeOf(['docs/images/rota.png'])).toEqual({ app: false, e2e: 'none', suites: [] })
  })

  test('Markdown under content is rendered by the application, so it runs everything', () => {
    expect(scopeOf(['content/docs/foh/door.md'])).toEqual(EVERYTHING)
    expect(scopeOf(['README.md', 'content/about.md'])).toEqual(EVERYTHING)
  })
})

describe('a change the browser cannot see skips the end-to-end suites alone (0110)', () => {
  test.each([
    ['tests/unit/year.test.ts'],
    ['tests/integration/rota.test.ts'],
    ['scripts/check.ts'],
    ['scripts/check-docs.ts'],
    ['.github/workflows/ci.yml'],
    ['.github/pull_request_template.md'],
  ])('%s', (path) => {
    expect(scopeOf([path, 'docs/architecture.md'])).toEqual({ app: true, e2e: 'none', suites: [] })
  })
})

describe('a change to end-to-end suites alone runs those suites (0110)', () => {
  test('the suites edited, and nothing else', () => {
    expect(scopeOf(['tests/e2e/rota.test.ts', 'tests/e2e/door-one-field.test.ts', 'tests/unit/year.test.ts']))
      .toEqual({ app: true, e2e: 'some', suites: ['tests/e2e/door-one-field.test.ts', 'tests/e2e/rota.test.ts'] })
  })

  test.each([
    ['tests/helpers/webview.ts'],
    ['tests/e2e/fixtures/people.ts'],
    ['scripts/run-tests.ts'],
    ['.github/workflows/e2e.yml'],
    ['bun.lock'],
    ['package.json'],
    ['nuxt.config.ts'],
    ['app/pages/index.vue'],
    ['server/utils/ledger.ts'],
    ['shared/money.ts'],
    ['migration/schema.ts'],
    ['server/db/migrations/sqlite/0130_x.sql'],
  ])('beside %s, every suite runs', (path) => {
    expect(scopeOf(['tests/e2e/rota.test.ts', path])).toEqual(EVERYTHING)
  })
})

describe('anything the rules do not name runs everything (0110)', () => {
  test('an empty diff is not read as nothing changed', () => {
    expect(scopeOf([])).toEqual(EVERYTHING)
  })

  test('a file at the root that is not Markdown', () => {
    expect(scopeOf(['wrangler.jsonc'])).toEqual(EVERYTHING)
  })

  test('a path that only resembles an allowed one', () => {
    expect(scopeOf(['docs.ts'])).toEqual(EVERYTHING)
    expect(scopeOf(['scripts/checklist.ts'])).toEqual(EVERYTHING)
    expect(scopeOf(['tests/e2e/rota.test.tsx'])).toEqual(EVERYTHING)
  })
})
