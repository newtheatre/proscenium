// What publishing a production needs (part 3) and the production page's "Ready to publish?" lines
// (R-35, core.record-check), from one list so the two can never disagree. A rule marked `needed`
// stops publishing (publishProduction asks `publishingNeeds`); the rest are what the public page
// wants and stop nothing. Each line links to the tab where it is put right.
import { first } from '#kit'
import type { RecordCheck } from '../points/record-check'
import { sellsHere } from './booking'

const RECORD = 'core.production'
const VIEW = 'core.production.view'
const tab = (id: string, name: string) => `/console/programme/productions/${id}?tab=${name}`

interface Rule {
  key: string
  /** The line's place in the list. */
  order: number
  sentence: string
  tab: string
  /** Whether publishing stops without it. */
  needed: boolean
  /** Whether the rule asks anything of this theatre at all; a rule that does not is left out. */
  applies?: () => Promise<boolean>
  done: (id: string) => Promise<boolean>
}

const RULES: Rule[] = [
  { key: 'summary', order: 10, sentence: 'A summary', tab: 'details', needed: true, // not-policy: the line's place in the list
    done: async id => !!await first('SELECT 1 FROM core_productions WHERE id = ? AND summary IS NOT NULL', id) },
  { key: 'category', order: 20, sentence: 'A category', tab: 'details', needed: true, // not-policy: the line's place in the list
    done: async id => !!await first('SELECT 1 FROM core_productions WHERE id = ? AND category_term_id IS NOT NULL', id) },
  { key: 'effects', order: 25, sentence: 'Staging effects listed, or none confirmed', tab: 'advisories', needed: true, // not-policy: the line's place in the list
    done: async id => !!await first(`SELECT 1 FROM core_productions p WHERE p.id = ?
      AND (p.effects_confirmed_none = 1 OR EXISTS (SELECT 1 FROM core_production_effects e WHERE e.production_id = p.id))`, id) },
  { key: 'advisories', order: 30, sentence: 'Content warnings listed, or none confirmed', tab: 'advisories', needed: true, // not-policy: the line's place in the list
    done: async id => !!await first(`SELECT 1 FROM core_productions p WHERE p.id = ?
      AND (p.advisories_confirmed_none = 1 OR EXISTS (SELECT 1 FROM core_production_advisories a WHERE a.production_id = p.id))`, id) },
  // With no booking module switched on, the public can only book through the production's own link.
  { key: 'booking', order: 35, sentence: 'A booking link, as nothing here sells tickets', tab: 'details', needed: true, // not-policy: the line's place in the list
    applies: async () => !await sellsHere(),
    done: async id => !!await first('SELECT 1 FROM core_productions WHERE id = ? AND external_booking_url IS NOT NULL', id) },
  { key: 'poster', order: 40, sentence: 'A poster', tab: 'media', needed: false, // not-policy: the line's place in the list
    done: async id => !!await first("SELECT 1 FROM core_files WHERE owner_type = 'core.production' AND owner_id = ? AND slot = 'core.production-poster' AND state = 'ready' AND attached_at IS NOT NULL", id) },
  { key: 'dates', order: 50, sentence: 'A scheduled performance', tab: 'dates', needed: false, // not-policy: the line's place in the list
    done: async id => !!await first("SELECT 1 FROM core_performances WHERE production_id = ? AND state = 'scheduled'", id) },
]

export interface PublishingNeed { key: string, sentence: string, link: string }

/** What publishing still needs, in the checklist's own words and order. Empty when it can be published. */
export async function missingToPublish(id: string): Promise<PublishingNeed[]> {
  const needs: PublishingNeed[] = []
  for (const rule of RULES) {
    if (!rule.needed || (rule.applies && !await rule.applies())) continue
    if (!await rule.done(id)) needs.push({ key: rule.key, sentence: rule.sentence, link: tab(id, rule.tab) })
  }
  return needs
}

function line(key: string): RecordCheck {
  const rule = RULES.find(r => r.key === key)!
  return {
    record: RECORD,
    ability: VIEW,
    order: rule.order,
    check: async (id) => {
      if (rule.applies && !await rule.applies()) return null
      return { done: await rule.done(id), sentence: rule.sentence, link: tab(id, rule.tab), needed: rule.needed }
    },
  }
}

export const summaryCheck = line('summary')
export const categoryCheck = line('category')
export const effectsCheck = line('effects')
export const advisoriesCheck = line('advisories')
export const bookingCheck = line('booking')
export const posterCheck = line('poster')
export const datesCheck = line('dates')
