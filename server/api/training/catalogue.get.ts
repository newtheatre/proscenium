import { z } from 'zod'

const query = z.object({
  department: z.string().trim().max(40).optional(),
})

// Deliberately public: what the theatre teaches is how somebody decides to get involved (G-128).
// Signing in adds what they hold and the material links, and changes nothing else.
export default defineEventHandler(async (event) => {
  const input = await getValidatedQueryOrThrow(event, query)
  const account = await currentAccount(event)

  const items = await listModules(
    { ...input, includeDrafts: false, includeRetired: false },
    await academicYear(event),
    false,
  )

  // Named, not just coded: DEPT-LCT means nothing to somebody who has not joined yet.
  const departments = await listDepartments(false)
  const named = new Map(departments.map(department => [department.code, department.name]))

  const prerequisites = await prerequisitesOf(items.map(module => module.id))
  const held = account ? await modulesHeldBy(account.id, londonToday()) : null

  return {
    items: items.map(module => ({
      id: module.id,
      department: module.department,
      departmentName: named.get(module.department) ?? module.department,
      kind: module.kind,
      name: module.name,
      description: module.description,
      deliveryMode: module.deliveryMode,
      expiryMode: module.expiryMode,
      expiryMonths: module.expiryMonths,
      safetyCritical: module.safetyCritical,
      prerequisites: (prerequisites.get(module.id) ?? []).map(edge => ({
        moduleId: edge.requiresId,
        name: edge.requiresName,
        held: held ? held.has(edge.requiresId) : null,
      })),
      // A Drive folder is not a public page, so a signed-out visitor is not given the link.
      materials: account ? module.materials : [],
      held: held ? held.has(module.id) : null,
    })),
    departments: departments
      .filter(department => items.some(module => module.department === department.code))
      .map(department => ({ code: department.code, name: department.name })),
    total: items.length,
    signedIn: account !== null,
  }
})
