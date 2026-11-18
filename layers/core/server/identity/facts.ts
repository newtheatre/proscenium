// The theatre's mapping of facts to abilities (ID-22, part 3 "Facts"): a fact a module declares,
// such as "is the stage manager of this production", brings the abilities the theatre maps to it,
// edited the same way as a role. A privileged ability counts only once the theatre has confirmed it.
import { all, isEnabled, nowMs, refuse, type Actor, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { impliedAbility } from '#kit/abilities'
import { abilityError, checkAbilities, notHeld } from './roles'

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
  return [...registry.abilities].map(([name, { module, decl }]) => ({
    name,
    module,
    risk: decl.risk,
    implies: (decl.implies ?? []).map(entry => impliedAbility(module, entry)),
    label: `${module}.abilities.${name.slice(module.length + 1)}.label`,
    held: !missing.has(name),
    moduleOn: on.get(module) ?? false,
  }))
}

/** Every declared fact, with the abilities mapped to it and whether each privileged one is confirmed. */
export async function factMappings() {
  const registry = useRegistry()
  const rows = await all<{ fact: string, ability: string, confirmed_privileged_at: number | null }>('SELECT fact, ability, confirmed_privileged_at FROM core_fact_abilities WHERE pinned_record = \'\' ORDER BY ability')
  return [...registry.facts].map(([name, { module, decl }]) => ({
    name,
    module,
    on: decl.on ?? null,
    standing: !!decl.standing,
    label: `${module}.facts.${name.slice(module.length + 1)}.label`,
    abilities: rows.filter(r => r.fact === name).map(r => ({ ability: r.ability, confirmed: r.confirmed_privileged_at !== null })),
  }))
}

/**
 * Sets the abilities a fact brings. Abilities it gains must be held by the actor, as for a role,
 * and a privileged one is mapped only with `confirmPrivileged`, the theatre's confirmation that
 * whoever the fact names may do it.
 */
export async function setFactAbilities(unit: UnitView, actor: Actor, fact: string, input: { abilities: string[], confirmPrivileged?: boolean }): Promise<void> {
  const registry = useRegistry()
  if (!registry.facts.has(fact)) refuse('core.not-found', 'There is no such fact.', { status: 404 })
  const abilities = checkAbilities(input.abilities)
  const before = await all<{ ability: string, confirmed_privileged_at: number | null }>('SELECT ability, confirmed_privileged_at FROM core_fact_abilities WHERE fact = ? AND pinned_record = \'\'', fact)
  const had = new Map(before.map(r => [r.ability, r.confirmed_privileged_at]))
  const missing = await notHeld(actor, abilities.filter(a => !had.has(a)))
  if (missing.length) abilityError(missing)
  const at = nowMs()
  const privileged = (a: string) => registry.abilities.get(a)?.decl.risk === 'privileged'
  const unconfirmed = abilities.filter(a => privileged(a) && !had.get(a))
  if (unconfirmed.length && !input.confirmPrivileged) {
    refuse('core.fact.confirm-privileged', 'Some of these abilities amount to control over other people or the theatre.', { status: 422, remedy: 'Confirm that whoever this fact names should hold them.', fields: { abilities: unconfirmed.join(', ') } })
  }
  unit.add({ sql: 'DELETE FROM core_fact_abilities WHERE fact = ? AND pinned_record = \'\'', params: [fact] })
  if (abilities.length) {
    unit.add({
      sql: `INSERT INTO core_fact_abilities (fact, ability, pinned_record, confirmed_privileged_at, created_by, created_at) VALUES ${abilities.map(() => '(?, ?, \'\', ?, ?, ?)').join(', ')}`,
      params: abilities.flatMap(a => [fact, a, privileged(a) ? (had.get(a) ?? at) : null, actor.accountId ?? null, at]),
    })
  }
  unit.audit({ action: 'update', detail: { fact, abilities: abilities.length, confirmed: unconfirmed.length } })
}
