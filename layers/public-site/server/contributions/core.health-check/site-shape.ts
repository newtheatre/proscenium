// Health: two modules want the front page or the production address at once (C-71, C-73). The first
// in manifest order wins; the other is named so somebody switches one off.
import { applying } from '../../shape'
import type { FrontPage, ProductionAddress } from '../../points/site-shape'

export default {
  async check() {
    const clashes: string[] = []
    const front = await applying<FrontPage>('public-site.front-page')
    if (front.length > 1) clashes.push(`the front page (${front.map(f => f.module).join(' and ')})`)
    const address = await applying<ProductionAddress>('public-site.production-address')
    if (address.length > 1) clashes.push(`where production pages live (${address.map(a => a.module).join(' and ')})`)
    if (!clashes.length) return { state: 'ok', sentence: 'No two modules want the same part of the public site.' }
    return {
      state: 'warning',
      sentence: `Two modules want ${clashes.join(', and ')}; the first is used.`,
      remedy: 'Switch one of them off, or change its setting, so the site does what you expect.',
      to: '/admin/modules',
    }
  },
} satisfies { check: () => Promise<{ state: 'ok' | 'warning' | 'failing', sentence: string, remedy?: string, to?: string }> }
