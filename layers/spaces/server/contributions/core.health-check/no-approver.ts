// A room that can be booked must have someone who may decide its requests (rule A2, SP-13), or a
// request for it waits until it expires.
import { holdersOf } from '#modules/core'
import { listBookables } from '../../setup'

export default {
  async check() {
    const stuck: string[] = []
    for (const b of await listBookables()) {
      if (b.state !== 'active') continue
      if (!(await holdersOf('spaces.booking.decide', ['spaces.bookable', b.id])).length) stuck.push(b.name)
    }
    if (!stuck.length) return { state: 'ok', sentence: 'Every room that can be booked has someone who may decide its requests.' }
    return { state: 'failing', sentence: `Nobody may decide requests for ${stuck.join(', ')}.`, remedy: 'Give a role the ability to decide room booking requests, for these rooms or the whole site.' }
  },
} satisfies { check: () => Promise<{ state: 'ok' | 'warning' | 'failing', sentence: string, remedy?: string }> }
