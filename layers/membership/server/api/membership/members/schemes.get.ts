// The schemes the viewer may add members to or import members into, for the buttons on the members
// list: each with the lengths on sale, whether adding asks how a fee is settled, and the list it checks
// a reference against. Withdrawn lengths are never offered.
import { can, defineRoute } from '#kit'
import { charger } from '../../../charge'
import { schemeList } from '../../../lists'
import { lengthOptions, listSchemes } from '../../../schemes'

export default defineRoute({ ability: 'membership.membership.view', rateLimit: 'default' }, async (_event, { actor }) => {
  const schemes = await listSchemes(['open', 'closed'])
  const options = await lengthOptions(schemes.map(s => s.id), true)
  const fees = !!(await charger())
  const out = []
  for (const scheme of schemes) {
    const record = ['membership.scheme', scheme.id] as const
    const canAdd = scheme.state === 'open' && (await can(actor, 'membership.membership.add', record)).allowed
    const canImport = (await can(actor, 'membership.membership.import', record)).allowed
    if (!canAdd && !canImport) continue
    const list = await schemeList(scheme)
    out.push({
      id: scheme.id,
      name: scheme.name,
      lengthRule: scheme.lengthRule,
      options: (options.get(scheme.id) ?? []).map(o => ({ id: o.id, name: o.name })),
      feesOn: scheme.requiresPayment && fees,
      reference: list?.keyKind === 'reference' ? { listName: list.name, label: list.referenceLabel } : null,
      canAdd,
      canImport,
    })
  }
  return { schemes: out }
})
