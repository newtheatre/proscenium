import { z } from 'zod'

const query = z.object({
  department: z.string().trim().max(40).optional(),
})

// The catalogue a member browses. Drafts never appear here, and a retired module stays readable so
// a record's module link still resolves (G-103 criteria 4 and 5).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await listModules(
    { ...input, includeDrafts: false, includeRetired: true },
    await academicYear(event),
    // Lead-only notes are for the admin surface; a member never sees them (G-107 criterion 5).
    false,
  )

  const held = await modulesHeldBy(account.id, londonToday())
  const prerequisites = await prerequisitesOf(items.map(module => module.id))

  return {
    items: items.map(module => ({
      ...module,
      retired: module.status === 'RETIRED',
      // Each edge marked for the person reading it, which is what makes the list a path rather
      // than a description (G-103 criterion 2).
      prerequisites: (prerequisites.get(module.id) ?? []).map(edge => ({
        moduleId: edge.requiresId,
        name: edge.requiresName,
        held: held.has(edge.requiresId),
      })),
    })),
    total: items.length,
  }
})
