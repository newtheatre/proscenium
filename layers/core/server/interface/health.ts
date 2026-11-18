// What needs attention on the Admin overview (AC-5, AC-12): every health check that is not ok,
// failing first. A check that throws is reported as failing, since nobody could tell otherwise.
import { usePoint } from '#kit'
import type { HealthCheck } from '../points/health-check'

export interface HealthProblem { id: string, module: string, state: 'warning' | 'failing', sentence: string, remedy?: string, to?: string }

export async function healthProblems(): Promise<HealthProblem[]> {
  const out: HealthProblem[] = []
  for (const { id, module, value } of await usePoint<HealthCheck>('core.health-check')) {
    try {
      const result = await value.check()
      if (result.state !== 'ok') out.push({ id, module, state: result.state, sentence: result.sentence, remedy: result.remedy, to: result.to })
    }
    catch {
      out.push({ id, module, state: 'failing', sentence: `The check ${id} could not run.` })
    }
  }
  return out.sort((a, b) => Number(b.state === 'failing') - Number(a.state === 'failing'))
}
