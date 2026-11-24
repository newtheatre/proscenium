// A copy's row by id, kept apart from runs.ts so people.ts can read it without importing the job.
import { first } from '#kit'
import type { RunRow } from './runs'

export const runById = (id: string) => first<RunRow>('SELECT * FROM reports_runs WHERE id = ?', id)
