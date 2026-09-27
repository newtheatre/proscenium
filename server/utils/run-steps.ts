type Steps = Record<string, () => Promise<unknown>>

// Runs every step in turn whatever happened to the ones before, so one fault cannot cost a later
// step its night; each failure is logged by name, and the run still fails at the end.
export async function runEachStep<T extends Steps>(task: string, steps: T): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: Record<string, unknown> = {}
  const failed: string[] = []

  for (const [step, run] of Object.entries(steps)) {
    try {
      results[step] = await run()
    }
    catch (error) {
      failed.push(step)
      console.error(`[${task}] ${step} failed`, error)
    }
  }

  if (failed.length > 0) throw new Error(`${task}: ${failed.join(', ')} failed; every other step ran`)
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> }
}
