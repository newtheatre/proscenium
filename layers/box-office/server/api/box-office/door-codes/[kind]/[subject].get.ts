// A door code of another kind for the signed-in person, such as their membership card (MEM-51). The
// contributing module decides whether they may have one; Box office signs it with the current key,
// so a card opened again after a key is retired is genuine again.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { doorCodeKind, signDoorCode } from '../../../../door-codes'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event) => {
  const kind = await doorCodeKind(getRouterParam(event, 'kind') ?? '')
  const code = kind ? await kind.issue(getRouterParam(event, 'subject') ?? '') : null
  if (!kind || !code) refuse('core.not-found', 'There is no code to show for that.', { status: 404 })
  return { doorCode: await signDoorCode(kind!.kind, code!) }
})
