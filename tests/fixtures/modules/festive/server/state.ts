// What the fixture's contributions answer, set by each test.
export const festive = {
  on: false,
  /** Records the sections apply to; anything else answers false. */
  ids: new Set<string>(),
  failing: false,
}
