// Practice mode's addresses and mark (Practice mode, parts 3 and 5), shared by the server and the
// app: the header a practice tab sends, the prefix of its pages, and how a live page maps into one.

/** The mark a practice tab sends with every request (M1, M5). */
export const PRACTICE_HEADER = 'proscenium-practice'

const PREFIX = '/practice'
const LIVE = '/live'

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

/** Whether an address is one of practice mode's pages: the list, a scenario's start, or a framed live page. */
export function isPracticePath(path: string): boolean {
  return under(path.split(/[?#]/)[0] ?? '', PREFIX)
}

/** The live page a framed practice address shows ('/practice/live/door' is '/live/door'), or null. */
export function liveOf(path: string): string | null {
  const clean = path.split(/[?#]/)[0] ?? ''
  return under(clean, PREFIX + LIVE) ? clean.slice(PREFIX.length) : null
}

/** The framed practice address of a live page ('/live/door?x=1' is '/practice/live/door?x=1'), or null for any other page. */
export function practiceOf(fullPath: string): string | null {
  return under(fullPath.split(/[?#]/)[0] ?? '', LIVE) ? PREFIX + fullPath : null
}

/** Whether a live address is part of a scenario: under one of its routes, or the Tonight hub itself. */
export function withinScenario(live: string, routes: readonly string[]): boolean {
  const clean = live.replace(/(?<=.)\/$/, '')
  return clean === LIVE || routes.some(route => under(clean, route.replace(/(?<=.)\/$/, '')))
}

/** A device copy's storage key: a practice tab keeps its copies apart from the real ones (O5). */
export function practiceKey(key: string, practising: boolean): string {
  return practising ? `practice:${key}` : key
}
