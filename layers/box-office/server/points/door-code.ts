// Contract for box-office.door-code: another kind of code the door screen reads, such as a membership
// card (Box office specification, part 5, "The door"). Every door code has four parts,
// `<kind>.<key id>.<code>.<signature>`, signed by Box office under the purpose box-office.door-code,
// so the contributing module never handles a key. Scanning one never admits anybody and writes no
// scan row: the door shows what resolve says.

export interface DoorCodeKind {
  /** The first part of the code: a short lower-case word, never `tkt`. */
  kind: string
  /** Who may scan one: anybody else is told the card is genuine and nothing more. */
  ability: string
  /**
   * The code part to sign for the subject, for the signed-in actor, or null when they may not have
   * one (not theirs, ended, or the module does not offer it). The code is the contributor's own: it
   * finds the subject from it in resolve.
   */
  issue: (subjectId: string) => Promise<string | null>
  /** What a scan shows: a headline and one line, holding no name. Null when the code is not known. */
  resolve: (code: string) => Promise<{ headline: string, line: string, state: 'ok' | 'attention' } | null>
  /**
   * Whose card it is, for the till: the holder's account, so a ticket for members or holders can be
   * sold to them by scanning it. Never shown at the door. Null when the code is not known. Optional:
   * a kind without it cannot name a holder.
   */
  holder?: (code: string) => Promise<string | null>
}
