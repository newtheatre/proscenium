// The companies list (CO-01): unarchived companies by name, with how many live engagements each has.
import { all, defineRoute } from '#kit'

export default defineRoute({ ability: 'companies.company.view', rateLimit: 'default' }, async () => ({
  companies: await all(`SELECT c.id, c.name, c.public_name AS publicName,
    (SELECT count(*) FROM companies_engagements e WHERE e.company_id = c.id AND e.state NOT IN ('cancelled', 'settled')) AS live
    FROM companies_companies c WHERE c.archived_at IS NULL ORDER BY c.name COLLATE NOCASE`),
}))
