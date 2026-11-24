// Practice coverage (Practice mode, PM-20): every page under /live, other than the live home, is in
// some practice scenario's routes, so a volunteer can practise every live screen before a real night.
import { join } from 'node:path'
import { ROOT } from '../lib/paths.ts'
import type { Loaded } from '../lib/load.ts'
import { pageRoute, walk } from './source.ts'

const LIVE = '/live'

/** A route covers a page at its own address or below it, never one that merely starts with the same letters. */
const covers = (route: string, page: string) => page === route || page.startsWith(`${route}/`)

export function uncoveredLivePages(pages: readonly string[], routes: readonly string[]): string[] {
  return pages.filter(page => page !== LIVE && covers(LIVE, page) && !routes.some(route => covers(route, page)))
}

export function checkPracticeCoverage(modules: Loaded[]): string[] {
  const routes: string[] = []
  for (const m of modules) {
    for (const s of ((m.manifest.contributes ?? {}) as Record<string, { routes?: string[] }[]>)['core.practice-scenario'] ?? []) routes.push(...s.routes ?? [])
  }
  const problems: string[] = []
  for (const m of modules) {
    const pagesDir = join(ROOT, m.found.root, 'app/pages')
    const pages = walk(pagesDir, ['.vue']).map(file => pageRoute(pagesDir, file))
    for (const page of uncoveredLivePages(pages, routes)) {
      problems.push(`${m.found.root}: the live page ${page} is in no practice scenario's routes; contribute a core.practice-scenario that covers it (PM-20)`)
    }
  }
  return problems
}
