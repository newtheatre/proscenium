// The fixture's crews, set by each test: an id, its members and the people who plan for it.
import { sql } from 'drizzle-orm'
import type { AvailabilityGroup } from '#modules/availability'

export const crews = new Map<string, { label: string, members: string[], planners: string[] }>()

export default {
  prefix: 'crews:',
  list: async viewerId => [...crews].filter(([, c]) => c.planners.includes(viewerId)).map(([id, c]) => ({ id, label: c.label })),
  members: groupId => sql`SELECT value AS id FROM json_each(${JSON.stringify(crews.get(groupId)?.members ?? [])})`,
  canPlan: async (viewerId, groupId) => !!crews.get(groupId)?.planners.includes(viewerId),
  groupsOf: async accountId => [...crews].filter(([, c]) => c.members.includes(accountId)).map(([id, c]) => ({ id, label: c.label })),
} satisfies AvailabilityGroup
