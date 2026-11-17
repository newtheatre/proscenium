// What the theatre's own pages (site/content/pages) leave unfinished (C-42): pages still marked as
// starter text, images with no text description, components a page uses, and settings it quotes.
// Pure: it reads pages as Nuxt Content stores them (a body of minimark nodes, [tag, props, ...children]),
// so it is tested without a content database. Which components are off and which settings are unset
// is the caller's to decide.

export interface ContentPage {
  path?: unknown
  stem?: unknown
  title?: unknown
  placeholder?: unknown
  body?: unknown
}

export interface PageRef {
  /** The page's title, or its address where it has none. */
  name: string
  path: string
  /** The file to edit, from the repository's root. */
  file: string
}

export interface ContentFindings {
  placeholders: PageRef[]
  /** Each image with no text description, by its source. */
  images: (PageRef & { src: string })[]
  /** Each component a page uses, by the tag the page writes (whats-on, setting). */
  components: (PageRef & { tag: string })[]
  /** Each setting a page quotes with :setting{name="..."}. */
  quoted: (PageRef & { key: string })[]
}

const PAGES_DIR = 'site/content/pages'

/** Tags Markdown itself writes, which are never a component. */
const MARKDOWN = new Set(['a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul', 'template'])

type Node = string | [string, Record<string, unknown>, ...Node[]]

function* nodes(list: unknown): Generator<[string, Record<string, unknown>]> {
  if (!Array.isArray(list)) return
  for (const node of list as Node[]) {
    if (!Array.isArray(node) || typeof node[0] !== 'string') continue
    const [tag, props, ...children] = node
    yield [tag, props && typeof props === 'object' ? props : {}]
    yield* nodes(children)
  }
}

export function readContent(pages: ContentPage[]): ContentFindings {
  const found: ContentFindings = { placeholders: [], images: [], components: [], quoted: [] }
  for (const page of pages) {
    if (typeof page.path !== 'string') continue
    const stem = typeof page.stem === 'string' ? page.stem.replace(/^pages\//, '') : page.path.replace(/^\//, '') || 'index'
    const ref: PageRef = { name: typeof page.title === 'string' && page.title ? page.title : page.path, path: page.path, file: `${PAGES_DIR}/${stem}.md` }
    if (page.placeholder === true) found.placeholders.push(ref)
    const body = (page.body as { value?: unknown } | undefined)?.value
    const seen = new Set<string>()
    for (const [tag, props] of nodes(body)) {
      if (tag === 'img') {
        if (typeof props.alt !== 'string' || !props.alt.trim()) found.images.push({ ...ref, src: typeof props.src === 'string' ? props.src : '' })
      }
      else if (tag === 'setting') {
        if (typeof props.name === 'string' && !seen.has(`setting:${props.name}`)) {
          seen.add(`setting:${props.name}`)
          found.quoted.push({ ...ref, key: props.name })
        }
      }
      if (!MARKDOWN.has(tag) && !seen.has(tag)) {
        seen.add(tag)
        found.components.push({ ...ref, tag })
      }
    }
  }
  return found
}
