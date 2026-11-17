// The production page's "Ready to publish?" lines (R-35, core.record-check). The first three are the
// publish rule's own needs (part 3) and stop publishing; a poster and a scheduled date are what the
// public page wants and stop nothing. Each line links to the tab where it is put right.
import { first } from '#kit'
import type { RecordCheck } from '../points/record-check'

const RECORD = 'core.production'
const VIEW = 'core.production.view'
const tab = (id: string, name: string) => `/console/programme/productions/${id}?tab=${name}`

function line(order: number, sentence: string, tabName: string, done: (id: string) => Promise<boolean>): RecordCheck {
  return { record: RECORD, ability: VIEW, order, check: async id => ({ done: await done(id), sentence, link: tab(id, tabName) }) }
}

export const summaryCheck = line(10, 'A summary', 'details', async id => // not-policy: the line's place in the list
  !!await first('SELECT 1 FROM core_productions WHERE id = ? AND summary IS NOT NULL', id))
export const categoryCheck = line(20, 'A category', 'details', async id => // not-policy: the line's place in the list
  !!await first('SELECT 1 FROM core_productions WHERE id = ? AND category_term_id IS NOT NULL', id))
export const effectsCheck = line(25, 'Staging effects listed, or none confirmed', 'advisories', async id => // not-policy: the line's place in the list
  !!await first(`SELECT 1 FROM core_productions p WHERE p.id = ?
    AND (p.effects_confirmed_none = 1 OR EXISTS (SELECT 1 FROM core_production_effects e WHERE e.production_id = p.id))`, id))
export const advisoriesCheck = line(30, 'Content warnings listed, or none confirmed', 'advisories', async id => // not-policy: the line's place in the list
  !!await first(`SELECT 1 FROM core_productions p WHERE p.id = ?
    AND (p.advisories_confirmed_none = 1 OR EXISTS (SELECT 1 FROM core_production_advisories a WHERE a.production_id = p.id))`, id))
export const posterCheck = line(40, 'A poster', 'media', async id => // not-policy: the line's place in the list
  !!await first("SELECT 1 FROM core_files WHERE owner_type = 'core.production' AND owner_id = ? AND slot = 'core.production-poster' AND state = 'ready' AND attached_at IS NOT NULL", id))
export const datesCheck = line(50, 'A scheduled performance', 'dates', async id => // not-policy: the line's place in the list
  !!await first("SELECT 1 FROM core_performances WHERE production_id = ? AND state = 'scheduled'", id))
