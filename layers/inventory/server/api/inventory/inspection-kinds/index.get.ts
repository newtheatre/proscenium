// Inspection kinds (INV-08), with the starting kinds offered while there are none.
import { defineRoute } from '#kit'
import { listKinds } from '../../../kinds'
import { STARTING_KINDS } from '../../../../shared/setup'

export default defineRoute({ ability: 'inventory.setup.manage', rateLimit: 'default' }, async () => {
  const kinds = await listKinds()
  return { kinds, starting: kinds.length ? [] : STARTING_KINDS }
})
