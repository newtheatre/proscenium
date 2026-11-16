// A basket, for whoever holds its token. A lapsed basket holds nothing and says so.
import { getHeader, getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { basketByToken } from '../../../baskets'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const basket = await basketByToken(getRouterParam(event, 'id')!, getHeader(event, 'x-basket-token') ?? '')
  if (!basket) refuse('box-office.basket.not-found', 'There is no such basket.', { status: 404 })
  return basket
})
