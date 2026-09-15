// Nuxt Content's own path rules for a file under content/: an ordering prefix (`04.box-office`)
// and an index file are not part of the URL. One function, so the tests and the check agree.
export function contentPathOf(file: string): string {
  const stem = file
    .replace(/\\/g, '/')
    .replace(/^content\//, '')
    .replace(/\.md$/, '')
    .split('/')
    .map(segment => segment.replace(/^\d+\./, ''))
    .join('/')
  const path = `/${stem}`.replace(/\/index$/, '')
  return path || '/'
}

// The tree the wiki is written in: every section folder sits directly under content/docs/.
export const DOCS_ROOT = 'content/docs'
