// Amber while no privacy contact is named: until then nobody can download their data or ask for it
// to be erased from My account > Your data (ID-15, ID-16; AC-5).
import { useSetting } from '#kit'
import type { HealthCheck } from '../../points/health-check'

export default {
  async check() {
    if (!(await useSetting('core.privacy.contact'))) return { state: 'warning', sentence: 'No privacy contact is set, so nobody can download their data or ask for it to be erased.', remedy: 'Name who to contact about personal data on Admin > Privacy.', to: '/admin/privacy?setting=core.privacy.contact' }
    return { state: 'ok', sentence: 'People can download their data and ask for it to be erased.' }
  },
} satisfies HealthCheck
