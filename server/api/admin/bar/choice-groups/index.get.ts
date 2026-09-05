// Every choice group and its stocked-item options, for attaching to a variant (F-113 criterion 2).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  return { groups: await listChoiceGroups() }
})
