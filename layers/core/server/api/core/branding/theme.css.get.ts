// The brand as a stylesheet of custom properties for light and dark. Cached for a minute, so a
// saved brand reaches every shell within a minute (C-35); the shells add ?v=<revision> as well.
import { defineRoute } from '#kit'
import { brandTokens, themeCss } from '../../../brand/theme'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  for (const [name, value] of Object.entries({ 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=60' })) event.res.headers.set(name, String(value)) // not-policy: C-35's "within a minute"
  return themeCss(await brandTokens())
})
