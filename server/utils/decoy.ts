// A hash of a value nobody knows, so verifying against it always fails and always costs what a
// real verification costs. Computed once per isolate (A-103).
let hash: Promise<string> | undefined

export function decoyHash(): Promise<string> {
  hash ??= hashPassword(crypto.randomUUID())
  return hash
}
