// Every email's wording, as the modules declare it: nothing a reader would see as markup or escapes.
import { describe, expect, it } from 'vitest'
import { findModules, loadManifest } from '../../../../scripts/lib/load'

describe('notification wording', () => {
  it('has no escaped line breaks a reader would see as \\n (EM-2)', async () => {
    const problems: string[] = []
    for (const found of findModules()) {
      const manifest = await loadManifest(found)
      for (const type of manifest.contributes?.['core.notification-type'] ?? []) {
        for (const [locale, wording] of Object.entries(type.wording as Record<string, { subject: string, body: string }>)) {
          if (/\\[nr]/.test(wording.body) || /\\[nr]/.test(wording.subject)) problems.push(`${type.id} (${locale})`)
        }
      }
    }
    expect(problems).toEqual([])
  }, 60_000)
})
