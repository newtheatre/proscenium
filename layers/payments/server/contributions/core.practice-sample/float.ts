// Sample set payments.float (Practice mode, part 4; PAY-10): a till ready to open at tonight's
// space with a float, paying by the practice card reader, and by cash only where the theatre takes
// cash (its own cash account came across with the copy). Says `cash` when it does.
import { all, changeSetting, definePracticeSample, newId, nowMs, useSetting, wordsFrom } from '#kit'
import { ensureScopedAccount } from '#modules/finance'
import { takesCash } from '../../providers'
import en from '../../../i18n/en-GB.json'

const t = wordsFrom(en)
const FLOAT = 5000 // not-policy: a practice float, used only where the theatre set none

export default definePracticeSample({
  after: ['core.tonight'],
  async seed(unit, { results }): Promise<Record<string, string>> {
    const id = newId('ppa')
    const at = nowMs()
    const label = t('payments.practice.reader')
    unit.add({
      sql: "INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, external_ref, active, created_at, updated_at) VALUES (?, 'practice-reader', ?, '[\"desk\"]', 'live', NULL, 1, ?, ?)",
      params: [id, label, at, at],
    })
    await ensureScopedAccount(unit, 'payments.card-clearing', id, label)
    const [place] = await all<{ space_id: string }>('SELECT space_id FROM core_performances WHERE id = ?', results.tonight)
    if (place) await changeSetting(unit, 'payments.sessions.default-space', place.space_id, { confirm: true })
    if (await useSetting('payments.sessions.default-float') === 0) await changeSetting(unit, 'payments.sessions.default-float', FLOAT, { confirm: true })
    return await takesCash() ? { cash: 'yes' } : {}
  },
})
