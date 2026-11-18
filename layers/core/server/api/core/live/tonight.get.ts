// The Tonight hub's list of tonight's performances, with their start times and the figures other
// modules give for each (D5, box office review). For anyone who may open live mode.
import { defineRoute, refuse } from '#kit'
import { tonight } from '../../../interface/tonight'
import { holdsLive } from '../../../interface/viewer'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  if (!await holdsLive(actor)) refuse('core.live.not-allowed', 'Live mode is not open to you.', { status: 403 })
  return { performances: await tonight(actor) }
})
