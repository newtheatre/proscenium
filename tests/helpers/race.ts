import { expect } from 'bun:test'

// Fires every attempt at once and waits for them all, so a racing test asserts on how the
// attempts settled rather than the order this loop happened to call them in (K-105, 0006).
export async function race<T>(count: number, attempt: (index: number) => Promise<T>): Promise<T[]> {
  return await Promise.all(Array.from({ length: count }, (_, index) => attempt(index)))
}

// The shape every named regression case in this suite proves: exactly one winner, and everyone
// else refused on the same status, however many raced (K-105 criterion 5).
export function expectOneWinner(answers: { status: number }[], winner = 200, loser = 409): void {
  const statuses = answers.map(answer => answer.status)
  expect(statuses.filter(status => status === winner)).toHaveLength(1)
  expect(statuses.filter(status => status !== winner).every(status => status === loser)).toBe(true)
}
