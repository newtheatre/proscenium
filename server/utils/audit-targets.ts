import { schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { SQL } from 'drizzle-orm'

// An entry's target is `kind:id`; these say what each kind is called, so the trail names its subject
// (J-103 criterion 6). A kind left out has nothing readable that is not somebody's own words (0011).

type Lookup = (key: SQL) => SQL

// A till is written `till:<venue>:<night>`; without a night the venue part is empty and matches none.
const tillVenue = (key: SQL): SQL => sql`substr(${key}, 1, instr(${key}, ':') - 1)`
const tillNight = (key: SQL): SQL => sql`substr(${key}, instr(${key}, ':') + 1)`

// Aliased: the listing joins `users` for the actor, and this one is a different person.
const subject = alias(schema.users, 'subject')

const NAMES = {
  'user': key => sql`SELECT ${subject.name} FROM ${schema.users} AS ${sql.identifier('subject')} WHERE ${subject.id} = ${key}`,
  'show': key => sql`SELECT ${schema.shows.title} FROM ${schema.shows} WHERE ${schema.shows.id} = ${key}`,
  'performance': key => sql`SELECT ${schema.shows.title} FROM ${schema.performances}
    JOIN ${schema.shows} ON ${schema.shows.id} = ${schema.performances.showId} WHERE ${schema.performances.id} = ${key}`,
  'season': key => sql`SELECT ${schema.seasons.name} FROM ${schema.seasons} WHERE ${schema.seasons.id} = ${key}`,
  'venue': key => sql`SELECT ${schema.venues.name} FROM ${schema.venues} WHERE ${schema.venues.id} = ${key}`,
  'till': key => sql`SELECT ${schema.venues.name} FROM ${schema.venues} WHERE ${schema.venues.id} = ${tillVenue(key)}`,
  'show-category': key => sql`SELECT ${schema.showCategories.name} FROM ${schema.showCategories} WHERE ${schema.showCategories.id} = ${key}`,
  'content-warning': key => sql`SELECT ${schema.contentWarnings.title} FROM ${schema.contentWarnings} WHERE ${schema.contentWarnings.id} = ${key}`,
  'ticket-type': key => sql`SELECT ${schema.ticketTypes.name} FROM ${schema.ticketTypes} WHERE ${schema.ticketTypes.id} = ${key}`,
  'pass-type': key => sql`SELECT ${schema.passTypes.name} FROM ${schema.passTypes} WHERE ${schema.passTypes.id} = ${key}`,
  'room': key => sql`SELECT ${schema.rooms.name} FROM ${schema.rooms} WHERE ${schema.rooms.id} = ${key}`,
  'space': key => sql`SELECT ${schema.externalSpaces.name} FROM ${schema.externalSpaces} WHERE ${schema.externalSpaces.id} = ${key}`,
  'bar-category': key => sql`SELECT ${schema.barCategories.name} FROM ${schema.barCategories} WHERE ${schema.barCategories.id} = ${key}`,
  'bar-product': key => sql`SELECT ${schema.barProducts.name} FROM ${schema.barProducts} WHERE ${schema.barProducts.id} = ${key}`,
  'bar-item': key => sql`SELECT ${schema.barItems.name} FROM ${schema.barItems} WHERE ${schema.barItems.id} = ${key}`,
  'bar-variant': key => sql`SELECT ${schema.barProducts.name} || ', ' || ${schema.productVariants.label} FROM ${schema.productVariants}
    JOIN ${schema.barProducts} ON ${schema.barProducts.id} = ${schema.productVariants.productId} WHERE ${schema.productVariants.id} = ${key}`,
  'bar-discount': key => sql`SELECT ${schema.discounts.name} FROM ${schema.discounts} WHERE ${schema.discounts.id} = ${key}`,
  'bar-choice-group': key => sql`SELECT ${schema.choiceGroups.name} FROM ${schema.choiceGroups} WHERE ${schema.choiceGroups.id} = ${key}`,
  'bar-opening': key => sql`SELECT ${schema.barOpenings.label} FROM ${schema.barOpenings} WHERE ${schema.barOpenings.id} = ${key}`,
  'module': key => sql`SELECT ${schema.trainingModules.name} FROM ${schema.trainingModules} WHERE ${schema.trainingModules.id} = ${key}`,
  'department': key => sql`SELECT ${schema.departments.name} FROM ${schema.departments} WHERE ${schema.departments.code} = ${key}`,
  'backstage-preset': key => sql`SELECT ${schema.backstagePresets.label} FROM ${schema.backstagePresets} WHERE ${schema.backstagePresets.id} = ${key}`,
  'backstage-milestone-type': key => sql`SELECT ${schema.backstageMilestoneTypes.label} FROM ${schema.backstageMilestoneTypes} WHERE ${schema.backstageMilestoneTypes.id} = ${key}`,
  'checklist-item': key => sql`SELECT ${schema.checklistItems.label} FROM ${schema.checklistItems} WHERE ${schema.checklistItems.id} = ${key}`,
  'period': key => sql`SELECT ${schema.periods.label} FROM ${schema.periods} WHERE ${schema.periods.id} = ${key}`,
} satisfies Record<string, Lookup>

// A performance or an opening is one of many under the same name, told apart by when it starts.
const TIMES = {
  'performance': key => sql`SELECT ${schema.performances.startsAt} FROM ${schema.performances} WHERE ${schema.performances.id} = ${key}`,
  'bar-opening': key => sql`SELECT ${schema.barOpenings.startsAt} FROM ${schema.barOpenings} WHERE ${schema.barOpenings.id} = ${key}`,
} satisfies Record<string, Lookup>

// A till session is one night rather than one instant, so it says its London show night (0014).
const NIGHTS = {
  till: key => sql`SELECT ${tillNight(key)} FROM ${schema.venues} WHERE ${schema.venues.id} = ${tillVenue(key)}`,
} satisfies Record<string, Lookup>

export const NAMED_TARGET_KINDS = Object.keys(NAMES)

// Kinds are fixed identifiers, so inlined as literals: the expression binds nothing, however many
// kinds it names, and the id is cut from the target so each lookup reads a primary key (0006).
function byKind(lookups: Record<string, Lookup>): SQL {
  const target = schema.auditLog.target
  const cases = Object.entries(lookups).map(([kind, lookup]) => {
    const prefix = `${kind}:`
    const key = sql`substr(${target}, ${sql.raw(String(prefix.length + 1))})`
    return sql`WHEN substr(${target}, 1, ${sql.raw(String(prefix.length))}) = ${sql.raw(`'${prefix}'`)} THEN (${lookup(key)})`
  })
  return sql`(CASE ${sql.join(cases, sql` `)} END)`
}

export const auditTargetName: SQL = byKind(NAMES)
export const auditTargetAt: SQL = byKind(TIMES)
export const auditTargetNight: SQL = byKind(NIGHTS)
