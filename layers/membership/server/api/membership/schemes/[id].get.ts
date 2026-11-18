// One scheme for its console screen: its fields, lengths, what opening it still needs, how many
// hold it, the lists it may check against, and the dates a membership taken today would run to (MEM-01's live example).
import { getRouterParam } from 'h3'
import { all, can, defineRoute } from '#kit'
import { charger } from '../../../charge'
import { listSetsEnd, schemeList } from '../../../lists'
import { todayOrNull } from '../../../memberships'
import { exampleDates, hasMemberships, lengthOptions, openChecklist, requireScheme } from '../../../schemes'

export default defineRoute({
  ability: 'membership.scheme.view',
  record: event => ['membership.scheme', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const scheme = await requireScheme(record!.id)
  const options = (await lengthOptions([scheme.id])).get(scheme.id)!
  const day = await todayOrNull()
  return {
    scheme,
    options,
    checklist: await openChecklist(scheme),
    // S2: the side is fixed once any membership exists.
    sideLocked: await hasMemberships(scheme.id),
    example: day ? exampleDates(scheme, options, day) : [],
    // D9: the list's end dates decide when a membership ends, so the example dates do not apply.
    endsByList: await listSetsEnd(await schemeList(scheme)),
    // The lists it may check against, by name only: never their contents.
    lists: await all<{ id: string, name: string }>('SELECT id, name FROM membership_verification_lists ORDER BY name'),
    // Whether a fee is collected through the system, so adding a member asks how it is settled (P9).
    feesOn: scheme.requiresPayment && !!(await charger()),
    // Whether Membership fees is on at all: while it is off, a fee cannot be asked for.
    feesModuleOn: !!(await charger()),
    // Whether this viewer may import members from a file (MEM-49).
    canImport: (await can(actor, 'membership.membership.import', ['membership.scheme', scheme.id])).allowed,
  }
})
