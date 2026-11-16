// The sections modules add to My account (side audience) or a member's own pages (side members),
// for the person asking: only those they hold the ability for, in order, with a section that has
// nothing to show (a count of zero, hideEmpty) left out. A module that is off leaves nothing behind.
import { z } from 'zod'
import { defineRoute, usePoint } from '#kit'
import { mayOpen, holds } from '../../interface/navigation'
import { isMember } from '../../interface/viewer'
import { shows } from '../../interface/counts'

interface Section { id: string, target: string, side: string, ability: string | string[], component: string, order: number, to?: string, icon?: string, count?: string, hideEmpty?: boolean }

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ side: z.enum(['audience', 'members']).default('audience') }),
}, async (_event, { input, actor }) => {
  // Nothing of the members' side is shown to someone who is not a member.
  if (input.side === 'members' && !(await isMember(actor))) return { sections: [] }
  const out: { id: string, component: string, to?: string, icon?: string, count?: number }[] = []
  for (const { value } of await usePoint<Section>('core.account-section')) {
    if (value.target !== 'account' || value.side !== input.side) continue
    if (!holds(await mayOpen(actor, { ability: value.ability }))) continue
    const { show, value: count } = await shows(value, actor)
    if (show) out.push({ id: value.id, component: value.component, to: value.to, icon: value.icon, count })
  }
  return { sections: out }
})
