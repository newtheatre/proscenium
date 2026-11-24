// A season's public words (C-67): the first contributor in manifest order that applies to it. A
// contributor that fails counts as not applying, so the usual words show.
import { all, usePoint } from '#kit'
import type { PublicWording, Wording } from '../points/public-wording'

async function applies(source: PublicWording, seasonId: string): Promise<boolean> {
  try {
    return await source.appliesTo(seasonId)
  }
  catch {
    return false
  }
}

/** The words a season's public pages, emails and feed use; null keeps the usual ones. */
export async function publicWordingFor(seasonId: string | null | undefined): Promise<Wording | null> {
  if (!seasonId) return null
  for (const source of await usePoint<PublicWording>('core.public-wording')) {
    if (await applies(source.value, seasonId)) return source.value.terms
  }
  return null
}

/** Seasons, not archived, that more than one contributor gives words to, with the contributors' ids. */
export async function wordingClashes(): Promise<{ season: string, contributors: string[] }[]> {
  const sources = await usePoint<PublicWording>('core.public-wording')
  if (sources.length < 2) return []
  const seasons = await all<{ id: string, name: string }>('SELECT id, name FROM core_seasons WHERE state <> \'archived\' ORDER BY name')
  const clashes: { season: string, contributors: string[] }[] = []
  for (const season of seasons) {
    const applying: string[] = []
    for (const source of sources) if (await applies(source.value, season.id)) applying.push(source.id)
    if (applying.length > 1) clashes.push({ season: season.name, contributors: applying })
  }
  return clashes
}
