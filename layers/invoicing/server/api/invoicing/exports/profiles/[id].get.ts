// One export profile (S11): its layout, and the code map over every ledger account, grouped by module,
// those with entries and no code first (E-05). Tax codes for the tax map (E-16).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { ledgerAccounts, listTaxCodes } from '#modules/finance'
import { codesOf, columnsOf, getProfile, isMoney } from '../../../../profiles'
import { currentDigest } from '../../../../build'

export default defineRoute({
  ability: 'invoicing.export.manage',
  rateLimit: 'default',
  record: event => ['invoicing.export-profile', getRouterParam(event, 'id')],
}, async (event) => {
  const profile = await getProfile(getRouterParam(event, 'id')!)
  const [codes, accounts, taxCodes, digest] = await Promise.all([codesOf(profile.id), ledgerAccounts(), listTaxCodes(), currentDigest(profile)])
  return {
    profile: { ...profile, columns: profile.format === 'custom' ? profile.columns : columnsOf(profile) },
    digest,
    accounts: accounts.filter(a => a.used || a.active).map(a => ({
      id: a.id,
      code: a.code,
      name: a.name,
      kind: a.kind,
      module: a.module,
      used: a.used,
      money: isMoney(a),
      codes: codes.filter(c => c.accountId === a.id).map(c => ({ postingKind: c.postingKind, code: c.code, codeName: c.codeName })),
    })),
    taxCodes: taxCodes.map(t => ({ code: t.code, label: t.label })),
  }
})
