// companies.contact-of (part 4, "Fact"): a live contact of the company itself, of the company of a live
// engagement, or of the live engagement on a production. Read from the table, so ending a contact ends it.
import { defineFact } from '#kit'
import { companyOf, isLiveContact, liveContacts } from '../contacts'

export default defineFact(async (actor, record) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  const companyId = await companyOf(record)
  return companyId ? isLiveContact(companyId, actor.accountId) : false
}, {
  holders: async (record) => {
    const companyId = await companyOf(record)
    return companyId ? liveContacts(companyId) : []
  },
})
