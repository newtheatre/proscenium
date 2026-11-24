// How a step reads in the console's lists (K2 and its editor): its kind, how often it is needed and
// whether it counts for a first award, a renewal or both.
import type { NeededFor, StepKind } from '../../shared/states'

export interface StepLike { kind: StepKind, timesRequired?: number, neededFor?: NeededFor }

export function useStepWords() {
  const { t } = useT()
  const kindLabel = (kind: StepKind) => t(`training.step-kinds.${kind}`)
  function describe(step: StepLike): string {
    const parts = [kindLabel(step.kind)]
    if ((step.timesRequired ?? 1) > 1) parts.push(t('training.step-words.times', { count: step.timesRequired ?? 1 }))
    if (step.neededFor && step.neededFor !== 'both') parts.push(t(`training.needed-for.${step.neededFor}`))
    return parts.join(', ')
  }
  return { kindLabel, describe }
}
