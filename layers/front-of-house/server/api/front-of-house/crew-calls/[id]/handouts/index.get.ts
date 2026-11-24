// The live handouts page (FH-50): everyone on the call with what they have earned and had.
import { getRouterParam } from 'h3'
import { defineRoute, today } from '#kit'
import { accountLabel } from '#modules/core'
import { requireCrewCall } from '../../../../../crew-calls'
import { handoutPeople } from '../../../../../perks'

export default defineRoute({
  ability: 'front-of-house.handout.record',
  record: event => ['front-of-house.crew-call', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const call = await requireCrewCall(record!.id!)
  return {
    call: { id: call.id, name: call.name, startsOn: call.startsOn, endsOn: call.endsOn, state: call.state, tshirts: call.tshirtMinShifts !== null, meals: call.mealMinMinutes !== null },
    today: await today(),
    people: await handoutPeople(call.id, { needs: false }, accountLabel),
  }
})
