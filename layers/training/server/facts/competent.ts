// training.competent (R10): holds the competency in hand now, exactly as the requirement source
// answers. Pinned on the permission screen to one competency, such as "holders of Lighting desk".
import { defineFact } from '#kit'
import { holdersOfCompetency, verdicts } from '../verdicts'

export default defineFact(async (actor, record) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  if (!record || record.type !== 'training.competency' || !record.id) return false
  const [verdict] = await verdicts([actor.accountId], [record.id])
  return !!verdict?.met
}, {
  holders: async record => (record?.type === 'training.competency' && record.id ? holdersOfCompetency(record.id) : []),
})
