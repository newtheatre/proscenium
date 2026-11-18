// Makes a pass (BO-64).
import { defineRoute, useSetting } from '#kit'
import { createPassType, passTypeInput } from '../../../passes'

export default defineRoute({
  ability: 'box-office.pass.manage',
  rateLimit: 'write',
  idempotent: true,
  input: passTypeInput,
}, async (_event, { input, unit, actor }) => ({ id: await createPassType(unit.view(), input, await useSetting('core.locale.currency') as string, actor.accountId ?? null) }))
