// The theatre's mapping of facts to abilities (ID-22, part 3 "Facts"): a fact a module declares,
// such as "is the stage manager of this production", brings the abilities the theatre maps to it,
// edited the same way as a role. A privileged ability counts only once the theatre has confirmed it.
import { all, first, isEnabled, nowMs, refuse, usePoint, type Actor, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { impliedAbility } from '#kit/abilities'
import { abilityError, checkAbilities, notHeld } from './roles'
import { pinnedRecordExists } from './grants'
import type { RecordResolver } from '../points/record-resolver'

/**
 * Every ability, with whether the actor holds it at site scope and whether its module is on, for
 * the role and fact editors.
 */
export async function abilityCatalogue(actor: Actor) {
  const registry = useRegistry()
  const names = [...registry.abilities.keys()]
  const missing = new Set(await notHeld(actor, names))
  const on = new Map<string, boolean>()
  for (const module of registry.modules.keys()) on.set(module, await isEnabled(module))
  // The record types an ability's record sits under, its own first, so the facts screen can offer a
  // fact on a performance the abilities on a performance or on anything under one.
  const within = (type: string | undefined): string[] => {
    const out: string[] = []
    for (let at = type; at && !out.includes(at); at = registry.records.get(at)?.decl.parent) out.push(at)
    return out
  }
  return [...registry.abilities].map(([name, { module, decl }]) => ({
    name,
    module,
    risk: decl.risk,
    on: decl.on ?? null,
    within: within(decl.on),
    implies: (decl.implies ?? []).map(entry => impliedAbility(module, entry)),
    label: `${module}.abilities.${name.slice(module.length + 1)}.label`,
    held: !missing.has(name),
    moduleOn: on.get(module) ?? false,
  }))
}

/**
 * Every declared fact, with the abilities mapped to it and whether each privileged one is confirmed,
 * and, for a pinnable fact, its mappings pinned to one record each. A pinned record that is gone
 * has no title and is shown as broken.
 */
export async function factMappings() {
  const registry = useRegistry()
  const rows = await all<{ fact: string, ability: string, pinned_record: string, confirmed_privileged_at: number | null }>('SELECT fact, ability, pinned_record, confirmed_privileged_at FROM core_fact_abilities ORDER BY ability')
  const out = []
  for (const [name, { module, decl }] of registry.facts) {
    const mine = rows.filter(r => r.fact === name)
    const pinned: { record: string, title: string | null, abilities: { ability: string, confirmed: boolean }[] }[] = []
    for (const record of [...new Set(mine.filter(r => r.pinned_record !== '').map(r => r.pinned_record))]) {
      const title = decl.pin && decl.on && (await pinnedRecordExists(decl.on, record)) ? await recordTitle(decl.on, record) : null
      pinned.push({ record, title, abilities: mine.filter(r => r.pinned_record === record).map(r => ({ ability: r.ability, confirmed: r.confirmed_privileged_at !== null })) })
    }
    out.push({
      name,
      module,
      on: decl.on ?? null,
      standing: !!decl.standing,
      pin: !!decl.pin,
      label: `${module}.facts.${name.slice(module.length + 1)}.label`,
      abilities: mine.filter(r => r.pinned_record === '').map(r => ({ ability: r.ability, confirmed: r.confirmed_privileged_at !== null })),
      pinned,
    })
  }
  return out
}

async function resolverFor(type: string): Promise<RecordResolver | undefined> {
  return (await usePoint<RecordResolver>('core.record-resolver')).find(r => r.id === type)?.value
}

/** A record's title through its type's resolver, or its id where the type resolves none. */
async function recordTitle(type: string, id: string): Promise<string> {
  return (await (await resolverFor(type))?.resolve(id))?.title ?? id
}

const MOST_CHOICES = 200 // not-policy: one screen of records to pin a mapping to

/** The records a pinnable fact's mapping may be pinned to, from its type's resolver. */
export async function pinChoices(fact: string): Promise<{ id: string, title: string }[]> {
  const decl = useRegistry().facts.get(fact)?.decl
  if (!decl) refuse('core.not-found', 'There is no such fact.', { status: 404 })
  if (!decl.pin || !decl.on) refuse('core.fact.not-pinnable', 'This fact cannot be limited to one record.', { status: 422 })
  return (await (await resolverFor(decl.on))?.choices?.(MOST_CHOICES)) ?? []
}

/**
 * Sets the abilities a fact brings, for every record or, with `record`, for that one record of a
 * pinnable fact's type. Abilities it gains must be held by the actor, as for a role, and a
 * privileged one is mapped only with `confirmPrivileged`, the theatre's confirmation that whoever
 * the fact names may do it. An empty list removes a pinned mapping.
 */
export async function setFactAbilities(unit: UnitView, actor: Actor, fact: string, input: { abilities: string[], confirmPrivileged?: boolean, record?: string }): Promise<void> {
  const registry = useRegistry()
  const declared = registry.facts.get(fact)
  if (!declared) refuse('core.not-found', 'There is no such fact.', { status: 404 })
  const pinned = input.record ?? ''
  if (pinned) {
    if (!declared.decl.pin || !declared.decl.on) refuse('core.fact.not-pinnable', 'This fact cannot be limited to one record.', { status: 422 })
    const before = await first('SELECT 1 AS found FROM core_fact_abilities WHERE fact = ? AND pinned_record = ?', fact, pinned)
    // A broken mapping may still be emptied; a new or changed one needs its record.
    if ((input.abilities.length || !before) && !(await pinnedRecordExists(declared.decl.on, pinned)))
      refuse('core.fact.record-missing', 'That record no longer exists.', { status: 422, remedy: 'Choose another record.' })
  }
  const abilities = checkAbilities(input.abilities)
  const before = await all<{ ability: string, confirmed_privileged_at: number | null }>('SELECT ability, confirmed_privileged_at FROM core_fact_abilities WHERE fact = ? AND pinned_record = ?', fact, pinned)
  const had = new Map(before.map(r => [r.ability, r.confirmed_privileged_at]))
  const missing = await notHeld(actor, abilities.filter(a => !had.has(a)))
  if (missing.length) abilityError(missing)
  const at = nowMs()
  const privileged = (a: string) => registry.abilities.get(a)?.decl.risk === 'privileged'
  const unconfirmed = abilities.filter(a => privileged(a) && !had.get(a))
  if (unconfirmed.length && !input.confirmPrivileged) {
    refuse('core.fact.confirm-privileged', 'Some of these abilities amount to control over other people or the theatre.', { status: 422, remedy: 'Confirm that whoever this fact names should hold them.', fields: { abilities: unconfirmed.join(', ') } })
  }
  unit.add({ sql: 'DELETE FROM core_fact_abilities WHERE fact = ? AND pinned_record = ?', params: [fact, pinned] })
  if (abilities.length) {
    unit.add({
      sql: `INSERT INTO core_fact_abilities (fact, ability, pinned_record, confirmed_privileged_at, created_by, created_at) VALUES ${abilities.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
      params: abilities.flatMap(a => [fact, a, pinned, privileged(a) ? (had.get(a) ?? at) : null, actor.accountId ?? null, at]),
    })
  }
  unit.audit({ action: 'update', detail: pinned ? { fact, record: pinned, abilities: abilities.length, confirmed: unconfirmed.length } : { fact, abilities: abilities.length, confirmed: unconfirmed.length } })
}
