// Let a basket go (Box office specification, part 3, "basket to expired"): the buyer's "Cancel and
// release", and Change tickets once the new choice is held. Only the basket's token opens it.
import { z } from 'zod'
import { getHeader, getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { abandonBasket } from '../../../../release'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  input: z.object({}).strict(),
}, (event, { unit }) => abandonBasket(unit.view(), getRouterParam(event, 'id')!, getHeader(event, 'x-basket-token') ?? ''))
