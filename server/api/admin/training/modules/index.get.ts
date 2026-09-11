import { filterQuerySchema } from '#shared/utils/list-filters'
import { trainingModulesList } from '#shared/utils/training-modules-list'

const query = filterQuerySchema(trainingModulesList)

// The catalogue, filtered and ordered by its declaration (K-129), with what each module's policy
// would stamp on a record awarded today. A lead sees only their own departments (G-110).
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueReader(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const clause = scopedClause(trainingModulesClause(input), scopeToLeadOf(resolved))
  const year = await academicYear(event)

  const total = await countAdminModules(clause)
  const items = await listAdminModules(clause, input.pageSize, offsetFor(input.page, input.pageSize), year)

  // Direct edges only, carried with the module so the editor has them without a second call.
  const prerequisites = await prerequisitesOf(items.map(module => module.id))
  const withPrerequisites = items.map(module => ({ ...module, prerequisites: prerequisites.get(module.id) ?? [] }))

  return envelope(withPrerequisites, total, input.page, input.pageSize)
})
