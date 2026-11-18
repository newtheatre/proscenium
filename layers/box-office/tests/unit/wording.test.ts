// Every message's wording, in every module: a newline written as the two characters backslash and
// n shows in the email as they are, so no subject or body may hold one.
import { describe, expect, it } from 'vitest'
import { findModules, loadManifest } from '../../../../scripts/lib/load.ts'

describe('message wording', async () => {
  const types: { id: string, locale: string, subject: string, body: string }[] = []
  for (const found of findModules()) {
    const manifest = await loadManifest(found)
    for (const type of manifest.contributes?.['core.notification-type'] ?? []) {
      for (const [locale, wording] of Object.entries(type.wording ?? {}) as [string, { subject: string, body: string }][])
        types.push({ id: type.id, locale, ...wording })
    }
  }

  it('finds the message types', () => {
    expect(types.some(t => t.id === 'box-office.order-reserved')).toBe(true)
  })

  it('has no escaped newline in any subject or body', () => {
    const escaped = types.filter(t => t.subject.includes('\\n') || t.body.includes('\\n')).map(t => `${t.id} (${t.locale})`)
    expect(escaped).toEqual([])
  })
})
