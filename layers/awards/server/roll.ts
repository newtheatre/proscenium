// The roll of honour: the current awards that are listed, grouped by award type. An award listed
// to members only is shown to somebody with a members' standing; a hidden or revoked one never is.
// A show is named only where the public may see it, and linked only where its page answers.
import { all, nowMs } from '#kit'

export interface RollEntry { id: string, name: string, awardedOn: string, awardedFor: string | null, citation: string | null, production: { title: string, slug: string, to: string | null } | null }
export interface RollType { key: string, name: string, summary: string | null, awards: RollEntry[] }

interface Row { id: string, typeKey: string, typeName: string, typeSummary: string | null, name: string, awardedOn: string, awardedFor: string | null, citation: string | null, productionTitle: string | null, productionSlug: string | null, productionPast: number | null }

const ROLL = `SELECT a.id, t.key AS typeKey, t.name AS typeName, t.summary AS typeSummary, a.recipient_name AS name, a.awarded_on AS awardedOn, a.awarded_for AS awardedFor, a.citation,
    p.title AS productionTitle, p.slug AS productionSlug, (p.state = 'cancelled' OR (p.last_ends_at IS NOT NULL AND p.last_ends_at <= ?2)) AS productionPast
  FROM awards_awards a JOIN awards_types t ON t.id = a.type_id
  LEFT JOIN core_productions p ON p.id = a.production_id AND p.state IN ('published', 'cancelled')
  WHERE a.state = 'current' AND a.recipient_name <> ''`

// `pages` says which production pages answer: none with the public site off, current ones alone
// while past shows are not public.
export async function roll(options: { members: boolean, typeKey?: string, pages?: 'all' | 'current' | 'none', now?: number }): Promise<RollType[]> {
  const pages = options.pages ?? 'all'
  const seen = options.members ? 'a.visibility IN (\'public\', \'members\')' : 'a.visibility = \'public\''
  const rows = await all<Row>(`${ROLL} AND ${seen} AND (?1 IS NULL OR t.key = ?1) ORDER BY t.state = 'archived', t.position, t.name, a.awarded_on DESC, a.recipient_name`, options.typeKey ?? null, options.now ?? nowMs()) // not-policy: numbered parameters
  const types = new Map<string, RollType>()
  for (const r of rows) {
    if (!types.has(r.typeKey)) types.set(r.typeKey, { key: r.typeKey, name: r.typeName, summary: r.typeSummary, awards: [] })
    types.get(r.typeKey)!.awards.push({ id: r.id, name: r.name, awardedOn: r.awardedOn, awardedFor: r.awardedFor, citation: r.citation, production: r.productionTitle && r.productionSlug ? { title: r.productionTitle, slug: r.productionSlug, to: pageOf(r.productionSlug, !!r.productionPast, pages) } : null })
  }
  return [...types.values()]
}

function pageOf(slug: string, past: boolean, pages: 'all' | 'current' | 'none'): string | null {
  if (pages === 'none' || (past && pages === 'current')) return null
  return `${past ? '/shows' : '/whats-on'}/${slug}`
}
