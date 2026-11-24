// One pass, for staff: its holder, its code, what is owed for it and what has been booked with it.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { accountLabel } from '#modules/core'
import { entriesOf, getPass } from '../../../../pass-holding'

export default defineRoute({
  ability: 'box-office.pass.manage',
  record: event => ['box-office.pass', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const pass = await getPass(record!.id!)
  return { pass: { ...pass, holder: pass.accountId ? await accountLabel(pass.accountId) : null }, entries: await entriesOf(pass.id) }
})
