// The access application in the person's own download (ID-15, ID-44): what they asked for, what is
// in force, the reviewer's last message and every read by staff, opened from its sealed columns.
import type { ExportContributor } from '../../points/export-contributor'
import { myApplication, readsOfApplication } from '../../identity/access-scheme'

export default {
  async export({ accountId }) {
    const application = await myApplication(accountId)
    if (!application) return []
    return [{
      path: 'access-application.json',
      title: 'Your access scheme application, and every time staff read it',
      bytes: JSON.stringify({ application, reads: await readsOfApplication(accountId) }, null, 2),
    }]
  },
} satisfies ExportContributor
