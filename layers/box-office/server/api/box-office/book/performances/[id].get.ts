// The public Choose tickets page's figures (Box office specification, part 6): one performance of a
// published production, whether it sells, and each band's ticket types and prices. Never a count.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { bookingPage } from '../../../../book'

export default defineRoute({ public: true, rateLimit: 'default' }, async event => bookingPage(getRouterParam(event, 'id', { decode: true })!))
