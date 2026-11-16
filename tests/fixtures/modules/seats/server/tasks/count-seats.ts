import { defineTask } from '#kit'

export const runs: number[] = []

export default defineTask((_unit, run) => {
  runs.push(run.dueAt)
})
