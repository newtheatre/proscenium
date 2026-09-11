// A raw constraint failure is never what a caller reads back (0047). Each module keeps its own
// table of refusals beside the write path it guards; this file holds only the shared match.

export interface ConstraintRefusal {
  violated: string
  says: string
}

// Anchored to the two real shapes (bare, and D1's wrapped form), so a message merely
// containing the phrase elsewhere is never misread as a refusal (0047).
const CONSTRAINT_FAILURE
  = /^(?:D1_ERROR:\s*)?(?:UNIQUE|CHECK|FOREIGN KEY|NOT NULL|PRIMARY KEY) constraint failed:\s*([a-z0-9_. ,]+?)(?:\s*:\s*SQLITE_CONSTRAINT)?$/i

// Unrecognised is always a defect the caller rethrows, never a guess: answering 409 for an error
// nobody named would hide it instead of surfacing it.
export function constraintRefusal(table: ConstraintRefusal[], error: unknown): { statusCode: 409, statusMessage: string } | null {
  // Drizzle wraps the driver's error as "Failed query: ..." and keeps the real one on `cause`, so
  // the chain is walked to the first message that names a constraint.
  for (let held: unknown = error; held !== undefined && held !== null; held = (held as { cause?: unknown }).cause) {
    const said = held instanceof Error ? held.message : String(held)
    const violated = CONSTRAINT_FAILURE.exec(said)?.[1]?.trim()
    const matched = table.find(refusal => refusal.violated === violated)
    if (matched) return { statusCode: 409, statusMessage: matched.says }
    if (held === (held as { cause?: unknown }).cause) break
  }
  return null
}
