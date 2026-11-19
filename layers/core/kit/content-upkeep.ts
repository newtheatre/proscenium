// The minute tick's hook for the content store's upkeep (layers/core/server/content-store.ts). The
// production entry installs it; elsewhere, tests included, the tick has no content store to mend.
let upkeep: ((at: number) => Promise<void>) | undefined

export function setContentUpkeep(next: ((at: number) => Promise<void>) | undefined): void {
  upkeep = next
}

export async function runContentUpkeep(at: number): Promise<void> {
  await upkeep?.(at)
}
