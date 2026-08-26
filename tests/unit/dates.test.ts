import { describe, test } from 'bun:test'

// Named regression cases (K-121). Each becomes a real failing test in the pull request that
// works its story; a passing stub here would be a lie about what is covered.
describe('Europe/London time discipline (K-106)', () => {
  test.todo('a 19:00 weekly rehearsal stays 19:00 wall clock across both clock changes', () => {})
  test.todo('a record expiring on a transition day expires on its date', () => {})
  test.todo('the show night runs 04:00 to 04:00 London, not UTC', () => {})
  test.todo('the committee year ends at the last London instant of 31 July', () => {})
  test.todo('academic-year carry-over matches the old training module\'s pinned arithmetic', () => {})
  test.todo('a date without an explicit zone is refused rather than assumed', () => {})
})
