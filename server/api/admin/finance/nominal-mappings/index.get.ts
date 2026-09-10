// The mapping every export line is categorised against (I-108 criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  return nominalMappings()
})
