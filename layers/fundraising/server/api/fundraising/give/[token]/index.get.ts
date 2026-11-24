// The thanks page (P4), for whoever holds the gift's link.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { thanksFor } from '../../../../giving'

export default defineRoute({ public: true, tokens: ['token'], rateLimit: 'presented-value' }, event => thanksFor(getRouterParam(event, 'token')!))
