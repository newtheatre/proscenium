import { describe, test } from 'bun:test'

// K-108 and J-107, seeded ahead of the migration and the write path (K-121). Each becomes a real
// test against `backup_drills` and the audit trail when the table exists.
describe('the restore drill record (K-108, J-107)', () => {
  test.todo('a recorded drill is append-only: no update and no delete reaches it', () => {})

  test.todo('recording a drill writes one audit entry naming the operator and the outcome', () => {})

  test.todo('the operations dashboard reads the last drill and flags a configured interval passed', () => {})

  test.todo('a weekly export failure alerts rather than vanishing (J-107 criterion 2)', () => {})
})
