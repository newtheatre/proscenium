// Builds a link to the site, as a job sending an email would; writes a performance first, so the test
// can see that a job deferred for want of the site's address keeps nothing it did.
import { defineJob, siteUrl } from '#kit'
import { performances } from '../db/schema'

export default defineJob<{ title: string }>(async (payload, unit) => {
  unit.insertSet(performances, [{ title: payload.title, capacity: 1 }])
  unit.insertSet(performances, [{ title: await siteUrl(`/shows/${payload.title}`), capacity: 1 }])
})
