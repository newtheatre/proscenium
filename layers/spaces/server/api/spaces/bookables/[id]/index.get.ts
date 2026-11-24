// A bookable's record: its details, week of hours and what each purpose may do here.
import { getRouterParam } from 'h3'
import { defineRoute, useSetting } from '#kit'
import { listVenues } from '#modules/core'
import { bookableRow, hoursOf, purposesOf } from '../../../../setup'

export default defineRoute({
  ability: 'spaces.bookable.manage',
  record: event => ['spaces.bookable', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (event) => {
  const id = getRouterParam(event, 'id')!
  const bookable = await bookableRow(id)
  const [hours, purposes, venues] = await Promise.all([hoursOf(id), purposesOf(id), bookable.kind === 'resource' ? listVenues() : Promise.resolve([])])
  const maxLength = await useSetting('spaces.bookings.max-length') as number
  const weekStarts = await useSetting('spaces.calendar.week-starts') as string
  return { bookable, hours, purposes, venues: venues.map(v => ({ id: v.id, name: v.name })), maxLengthMinutes: Math.round(maxLength / 60), weekStarts } // not-policy: seconds to minutes
})
