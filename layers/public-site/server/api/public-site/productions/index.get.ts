// What's on (C-38): published, listed productions with a scheduled performance still to come.
import { defineRoute } from '#kit'
import { currentProductions } from '#modules/core'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => ({ productions: await currentProductions() }))
