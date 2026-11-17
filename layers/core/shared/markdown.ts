// The small part of Markdown that public text fields take (a production's description, summary and
// content note; a venue's access and travel notes): paragraphs, line breaks, headings, bullet and
// numbered lists, **bold**, *italic* and [links](https://...). It parses to a tree that the page
// draws with Vue, never to HTML, so nothing typed can become markup: there is no raw HTML, no
// component, no image and no script, whoever wrote the text. A link must be https, mailto or tel,
// or a path on this site; anything else stays as plain text.

export type Inline
  = | { type: 'text', text: string }
    | { type: 'break' }
    | { type: 'strong' | 'em', children: Inline[] }
    | { type: 'link', href: string, children: Inline[] }

export type Block
  = | { type: 'paragraph', children: Inline[] }
    | { type: 'heading', level: 3 | 4, children: Inline[] }
    | { type: 'list', ordered: boolean, items: Inline[][] }

const BULLET = /^\s{0,3}[-*+]\s+(.*)$/
const NUMBERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/ // not-policy: CommonMark's bound on a list number
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/ // not-policy: Markdown's six heading levels

/** Splits text into blocks. Blank lines end a block; a list item runs on over its indented lines. */
export function parseMarkdown(source: string | null | undefined): Block[] {
  const lines = (source ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean, items: string[] } | null = null
  const endParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) })
    paragraph = []
  }
  const endList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(item => parseInline(item)) })
    list = null
  }
  for (const line of lines) {
    if (!line.trim()) {
      endParagraph()
      endList()
      continue
    }
    const heading = HEADING.exec(line)
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (heading) {
      endParagraph()
      endList()
      // The page's title is its h1 and its sections h2, so "#" becomes h3 and anything deeper h4.
      const level = Math.min(4, heading[1]!.length + 2) as 3 | 4 // not-policy: headings sit under the page's h2
      blocks.push({ type: 'heading', level, children: parseInline(heading[2]!) })
    }
    else if (bullet || numbered) {
      endParagraph()
      const ordered = !!numbered
      if (list && list.ordered !== ordered) endList()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1]!)
    }
    else if (list && /^\s+\S/.test(line)) {
      // An indented line carries on the item above it.
      list.items[list.items.length - 1] += `\n${line.trim()}`
    }
    else {
      endList()
      paragraph.push(line)
    }
  }
  endParagraph()
  endList()
  return blocks
}

/** Whether an address may be a link: https, mailto, tel, or a path on this site. */
export function isSafeHref(href: string): boolean {
  if (/^\/(?!\/)/.test(href)) return true
  try {
    const url = new URL(href)
    return url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:'
  }
  catch {
    return false
  }
}

const ESCAPABLE = /\\([\\`*_[\]()#+\-.!])/g

/** Bold, italic, links, line breaks (two spaces or a backslash at a line's end, or any newline). */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ type: 'text', text: text.replace(ESCAPABLE, '$1') })
    text = ''
  }
  let i = 0
  while (i < source.length) {
    const rest = source.slice(i)
    if (rest[0] === '\\' && rest.length > 1 && /[\\`*_[\]()#+\-.!]/.test(rest[1]!)) {
      text += rest.slice(0, 2)
      i += 2
      continue
    }
    // A newline is a break; two spaces or a backslash before it, Markdown's spellings of one, are not text.
    const newline = /^(?: +|\\)?\n/.exec(rest)
    if (newline) {
      text = text.replace(/ +$/, '')
      flush()
      out.push({ type: 'break' })
      i += newline[0].length
      continue
    }
    const strong = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest)
    if (strong) {
      flush()
      out.push({ type: 'strong', children: parseInline(strong[2]!) })
      i += strong[0].length
      continue
    }
    const em = /^(\*|_)(?=\S)([\s\S]*?\S)\1(?!\1)/.exec(rest)
    if (em && (em[1] === '*' || !/\w/.test(source[i - 1] ?? ''))) {
      flush()
      out.push({ type: 'em', children: parseInline(em[2]!) })
      i += em[0].length
      continue
    }
    const link = /^\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?\s*\)/.exec(rest)
    if (link) {
      const href = link[2]!
      flush()
      if (isSafeHref(href)) out.push({ type: 'link', href, children: parseInline(link[1]!) })
      else out.push(...parseInline(link[1]!))
      i += link[0].length
      continue
    }
    text += rest[0]
    i += 1
  }
  flush()
  return out
}

/** The text alone, for a social card or a search engine's description. */
export function plainText(source: string | null | undefined): string {
  const flat = (nodes: Inline[]): string => nodes.map(n => (n.type === 'text' ? n.text : n.type === 'break' ? ' ' : flat(n.children))).join('')
  return parseMarkdown(source).map(b => (b.type === 'list' ? b.items.map(flat).join(' ') : flat(b.children))).join(' ').replace(/\s+/g, ' ').trim()
}
