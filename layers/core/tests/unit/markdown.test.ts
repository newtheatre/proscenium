// The small Markdown of public text fields (shared/markdown.ts): what it draws, and that nothing
// typed becomes markup or an unsafe link.
import { describe, expect, it } from 'vitest'
import { isSafeHref, parseInline, parseMarkdown, plainText } from '../../shared/markdown'

const text = (t: string) => ({ type: 'text', text: t })

describe('blocks', () => {
  it('splits paragraphs on blank lines and keeps a single newline as a break', () => {
    expect(parseMarkdown('One line\nthe next\n\nA second paragraph')).toEqual([
      { type: 'paragraph', children: [text('One line'), { type: 'break' }, text('the next')] },
      { type: 'paragraph', children: [text('A second paragraph')] },
    ])
  })

  it('reads headings under the page\'s own sections, so # is h3 and deeper is h4', () => {
    expect(parseMarkdown('# About\n\n### Detail ###')).toEqual([
      { type: 'heading', level: 3, children: [text('About')] },
      { type: 'heading', level: 4, children: [text('Detail')] },
    ])
  })

  it('reads bullet and numbered lists, with indented lines carrying on an item', () => {
    expect(parseMarkdown('- one\n- two\n  more\n1. first\n2) second\nAfter')).toEqual([
      { type: 'list', ordered: false, items: [[text('one')], [text('two'), { type: 'break' }, text('more')]] },
      { type: 'list', ordered: true, items: [[text('first')], [text('second')]] },
      { type: 'paragraph', children: [text('After')] },
    ])
  })

  it('answers nothing for no text', () => {
    expect(parseMarkdown(null)).toEqual([])
    expect(parseMarkdown('  \n\n ')).toEqual([])
  })
})

describe('inline', () => {
  it('reads bold, italic and links, nested', () => {
    expect(parseInline('A **bold *and italic* too** [link](https://example.org) word')).toEqual([
      text('A '),
      { type: 'strong', children: [text('bold '), { type: 'em', children: [text('and italic')] }, text(' too')] },
      text(' '),
      { type: 'link', href: 'https://example.org', children: [text('link')] },
      text(' word'),
    ])
  })

  it('leaves underscores inside a word alone, and honours a backslash', () => {
    expect(parseInline('snake_case_name and \\*not italic\\*')).toEqual([text('snake_case_name and *not italic*')])
  })

  it('takes two spaces or a backslash before a newline as a break, not as text', () => {
    expect(parseInline('one  \ntwo\\\nthree')).toEqual([text('one'), { type: 'break' }, text('two'), { type: 'break' }, text('three')])
  })
})

describe('safety', () => {
  it('keeps HTML as text: there is no markup in the tree', () => {
    const tree = parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')
    expect(tree).toEqual([
      { type: 'paragraph', children: [text('<script>alert(1)</script>')] },
      { type: 'paragraph', children: [text('<img src=x onerror=alert(1)>')] },
    ])
  })

  it('makes a link only of https, mailto, tel or a path on this site', () => {
    for (const href of ['https://example.org/a', 'mailto:box@example.org', 'tel:+441234567890', '/whats-on']) expect(isSafeHref(href), href).toBe(true)
    for (const href of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'http://example.org', '//evil.example', 'vbscript:x', 'relative']) expect(isSafeHref(href), href).toBe(false)
    expect(parseInline('[click](javascript:alert(1))')).toEqual([text('click'), text(')')])
  })

  it('gives the plain text for a description or a social card', () => {
    expect(plainText('# Title\n\nA **bold** [link](https://x.example).\n\n- one\n- two')).toBe('Title A bold link. one two')
  })
})
