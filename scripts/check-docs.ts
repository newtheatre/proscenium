#!/usr/bin/env bun
// The operator documentation is a tree of pages with pictures (0076). A page missing its
// provenance, a picture nothing shows, or a link to nowhere is drift, and drift is a defect.

import { join } from 'node:path'
import { DOCS_AUDIENCES } from '#shared/utils/docs-audience'
import { DOCS_ROOT, HELP_ROOT, contentPathOf } from '#shared/utils/docs-paths'

const IMAGES = 'public/images/docs'
const REQUIRED = ['title', 'description', 'module', 'updatedBy'] as const

function files(pattern: string, cwd: string): string[] {
  try {
    return [...new Bun.Glob(pattern).scanSync({ cwd, onlyFiles: true })].map(file => file.replace(/\\/g, '/')).sort()
  }
  catch {
    return []
  }
}

function frontMatter(source: string): Record<string, string> {
  const match = source.match(/^---\n([\s\S]*?)\n---/)
  const fields: Record<string, string> = {}
  for (const line of (match?.[1] ?? '').split('\n')) {
    const pair = line.match(/^([A-Za-z]+):\s*(.*)$/)
    if (pair) fields[pair[1]!] = pair[2]!.trim()
  }
  return fields
}

const problems: string[] = []
const pages = files('**/*.md', DOCS_ROOT)
// Public help is held to the same provenance and links, in its own collection (0093).
const help = files('**/*.md', HELP_ROOT).map(file => `${HELP_ROOT}/${file}`)
const everyPage = [...pages.map(file => `${DOCS_ROOT}/${file}`), ...help]
const pictures = new Set(files('**/*.{png,webp,jpg}', IMAGES).map(file => `/images/docs/${file}`))
const referenced = new Set<string>()
const routes = new Map<string, string>()

for (const where of everyPage) {
  const path = contentPathOf(where)
  const held = routes.get(path)
  if (held) problems.push(`${where}  resolves to ${path}, the same page as ${held}`)
  routes.set(path, where)
}

for (const where of everyPage) {
  const source = await Bun.file(where).text()
  const fields = frontMatter(source)

  for (const key of REQUIRED) {
    if (!fields[key]) problems.push(`${where}  front matter has no ${key}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.updatedOn ?? '')) problems.push(`${where}  updatedOn is not an ISO date`)
  // Every page says who it is for (0093): public in help, member or committee in the operator tree.
  const allowed: readonly string[] = where.startsWith(`${HELP_ROOT}/`) ? ['public'] : DOCS_AUDIENCES
  if (!allowed.includes(fields.audience ?? '')) problems.push(`${where}  audience is not one of ${allowed.join(', ')}`)

  source.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)|<img[^>]+src="([^"]+)"/g)) {
      const src = match[1] ?? match[2]!
      referenced.add(src)
      if (!pictures.has(src)) problems.push(`${where}:${index + 1}  picture ${src} is not under ${IMAGES}`)
    }
    for (const match of line.matchAll(/\]\((\/(?:docs|help)[^)#\s]*)/g)) {
      if (!routes.has(match[1]!)) problems.push(`${where}:${index + 1}  link ${match[1]} is not a page`)
    }
  })
}

for (const picture of pictures) {
  if (!referenced.has(picture)) problems.push(`public${picture}  is shown by no page`)
}

for (const folder of new Set(pages.filter(file => file.includes('/')).map(file => file.split('/')[0]!))) {
  const navigation = Bun.file(join(DOCS_ROOT, folder, '.navigation.yml'))
  if (!await navigation.exists()) {
    problems.push(`${DOCS_ROOT}/${folder}  has no .navigation.yml`)
    continue
  }
  if (!/^title:\s*\S/m.test(await navigation.text())) problems.push(`${DOCS_ROOT}/${folder}/.navigation.yml  has no title`)
}

if (problems.length) {
  console.error('check-docs: the operator documentation has drifted from its own conventions.\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nEvery page carries title, description, module, audience, updatedOn and updatedBy; every')
  console.error(`picture it shows lives under ${IMAGES} and is shown by some page; every /docs or /help link`)
  console.error('lands on a page; every section folder has a .navigation.yml with a title (0076).')
  process.exit(1)
}

console.log(`check-docs: ${everyPage.length} page(s), ${pictures.size} picture(s), all accounted for.`)
