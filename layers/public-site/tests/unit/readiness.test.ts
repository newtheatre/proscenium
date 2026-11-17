// Reading the theatre's pages for the site-readiness screen (C-42): starter pages, images with no
// text description, the components a page uses and the settings it quotes.
import { describe, expect, it } from 'vitest'
import { readContent } from '../../server/readiness/content'

const page = (path: string, value: unknown[], extra: Record<string, unknown> = {}) => ({ path, stem: path === '/' ? 'index' : path.slice(1), title: `Page ${path}`, body: { type: 'minimark', value }, ...extra })

describe('site readiness reads the pages', () => {
  it('lists a page still marked as starter text, with the file to edit', () => {
    const found = readContent([page('/', [], { placeholder: true }), page('/about', [])])
    expect(found.placeholders).toEqual([{ name: 'Page /', path: '/', file: 'site/content/pages/index.md' }])
  })

  it('finds an image with no text description, however deep', () => {
    const found = readContent([page('/visit', [
      ['p', {}, ['img', { src: '/foyer.jpg', alt: '' }]],
      ['ul', {}, ['li', {}, ['img', { src: '/bar.jpg', alt: 'The bar' }]]],
      ['img', { src: '/map.png' }],
    ])])
    expect(found.images.map(i => i.src)).toEqual(['/foyer.jpg', '/map.png'])
    expect(found.images[0]!.file).toBe('site/content/pages/visit.md')
  })

  it('names each component a page uses once, and leaves Markdown alone', () => {
    const found = readContent([page('/', [
      ['h1', {}, 'Welcome'],
      ['whats-on', { limit: '3' }],
      ['p', {}, 'Prices in ', ['setting', { name: 'core.locale.currency' }]],
      ['whats-on', {}],
    ])])
    expect(found.components.map(c => c.tag)).toEqual(['whats-on', 'setting'])
  })

  it('collects the settings a page quotes, once each', () => {
    const found = readContent([page('/', [
      ['p', {}, ['setting', { name: 'core.site.name' }], ' ', ['setting', { name: 'core.site.name' }]],
      ['p', {}, ['setting', { name: 'core.locale.currency' }]],
      ['setting', {}],
    ])])
    expect(found.quoted.map(q => q.key)).toEqual(['core.site.name', 'core.locale.currency'])
  })

  it('takes a page with no title by its address, and ignores one with no address', () => {
    const found = readContent([{ path: '/news/first', placeholder: true }, { title: 'Nowhere', placeholder: true }])
    expect(found.placeholders).toEqual([{ name: '/news/first', path: '/news/first', file: 'site/content/pages/news/first.md' }])
  })
})
