// The step sources other modules contribute to training.step-source (H1, H4). A source whose module
// is switched off is not listed, so it reports nothing and cannot be chosen for a step.
import { refuse, usePoint } from '#kit'
import type { StepSource } from './points/step-source'

export async function stepSources(): Promise<{ id: string, module: string, source: StepSource }[]> {
  return (await usePoint<StepSource>('training.step-source')).map(c => ({ id: c.id, module: c.module, source: c.value }))
}

export async function stepSource(id: string): Promise<StepSource | null> {
  return (await stepSources()).find(x => x.id === id)?.source ?? null
}

/** The parameters an author chose, as the source accepts them, or refused. */
export async function sourceParams(id: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const source = await stepSource(id)
  if (!source) refuse('training.step.source-unknown', 'That activity cannot sign off a step just now.', { status: 422, remedy: 'Choose another kind of step, or switch on the module the activity comes from.' })
  const parsed = source.params.safeParse(params)
  if (!parsed.success) refuse('training.step.source-params', 'Choose what the activity must be.', { status: 422 })
  return parsed.data
}
