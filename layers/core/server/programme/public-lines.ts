// The billing lines other modules add to a production's public page (C-75). A contributor that
// fails adds nothing, never breaks the page.
import { usePoint } from '#kit'
import type { ProductionPublicLines, PublicLine } from '../points/public-lines'

const LONGEST = 200 // not-policy: a billing line, not a paragraph

export async function productionPublicLines(productionId: string): Promise<PublicLine[]> {
  const lines: PublicLine[] = []
  for (const source of await usePoint<ProductionPublicLines>('core.public-lines')) {
    try {
      for (const line of await source.value.read(productionId)) {
        const text = line.text.trim().slice(0, LONGEST)
        if (text) lines.push({ text, placement: line.placement, order: line.order ?? 0 })
      }
    }
    catch {
      // A billing line is never worth a broken page.
    }
  }
  return lines.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}
