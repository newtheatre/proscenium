// The seating layouts of every space that holds performances, with the spaces to add one to.
import { defineRoute } from '#kit'
import { listSpaces, placeName } from '#modules/core'
import { listLayouts } from '../../../layouts'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  rateLimit: 'default',
}, async () => {
  const spaces = await listSpaces({ performable: true })
  return {
    rows: await listLayouts(),
    spaces: await Promise.all(spaces.map(async s => ({ id: s.id, name: await placeName(s.id) ?? s.name, capacity: s.defaultCapacity ?? null }))),
  }
})
