// Every contributed scenario as a value to pick from, for the "Scenarios not offered" setting.
import { defineRoute } from '#kit'
import { scenarios } from '../../../practice/scenarios'

export default defineRoute({ ability: 'core.practice.manage', rateLimit: 'default', practice: 'outside' }, async () => {
  return { items: (await scenarios()).map(s => ({ value: s.id, label: s.label })) }
})
