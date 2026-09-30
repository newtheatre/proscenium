// What a pull request's changed files can reach, by the allowlist in 0110. Pure, so the workflow
// step and its tests read the same rule; a path no rule names runs everything.

export interface Scope {
  // Build, typecheck and lint. The unit and integration suites and `bun run check` always run.
  app: boolean
  e2e: 'all' | 'none' | 'some'
  suites: string[]
}

const EVERYTHING: Scope = { app: true, e2e: 'all', suites: [] }

// The application renders Markdown from `content/` alone (content.config.ts).
function documentation(path: string): boolean {
  return path.startsWith('docs/') || (path.endsWith('.md') && !path.startsWith('content/'))
}

function beyondTheBrowser(path: string): boolean {
  return path.startsWith('tests/unit/')
    || path.startsWith('tests/integration/')
    || /^scripts\/check(-[\w-]+)?\.ts$/.test(path)
    || (path.startsWith('.github/') && path !== '.github/workflows/e2e.yml' && !path.startsWith('.github/actions/'))
}

// Top level only: anything deeper in tests/e2e is a fixture every suite may lean on.
function suite(path: string): boolean {
  return /^tests\/e2e\/[^/]+\.test\.ts$/.test(path)
}

export function scopeOf(changed: readonly string[]): Scope {
  if (!changed.length) return EVERYTHING
  if (changed.every(documentation)) return { app: false, e2e: 'none', suites: [] }

  const reaching = changed.filter(path => !documentation(path) && !beyondTheBrowser(path))
  if (!reaching.every(suite)) return EVERYTHING
  const suites = [...new Set(reaching)].sort()
  return { app: true, e2e: suites.length ? 'some' : 'none', suites }
}
