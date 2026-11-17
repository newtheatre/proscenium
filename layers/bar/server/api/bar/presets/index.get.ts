// The product presets Add a product starts from: the built-ins, then the theatre's own.
import { defineRoute } from '#kit'
import { presets } from '../../../presets'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'default' }, async () => ({ presets: await presets() }))
