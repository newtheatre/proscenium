// Outside the project, because Nuxt's dev server watches it. Emptying the database between suites
// is a write, and a write inside the project reloads the server mid-suite (0029).
export function hubDirFor(port: string | number): string {
  return `/tmp/nnt-e2e-${port}`
}
