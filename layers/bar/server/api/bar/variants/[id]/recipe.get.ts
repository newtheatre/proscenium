// A size's recipe: its fixed items and choice slots, in order.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { recipe } from '../../../../stock'

export default defineRoute({ ability: 'bar.stock.manage', rateLimit: 'default' }, async event => ({ lines: await recipe(getRouterParam(event, 'id', { decode: true })!) }))
