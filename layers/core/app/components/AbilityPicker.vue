<!-- The abilities a role or a fact brings, grouped by module (identity spec part 6, rule 6, after
     Flytower's role editor). An ability that comes with one already ticked is ticked and locked; an
     ability that amounts to control over others or the theatre is marked; one the editor does not
     hold cannot be added, because nobody gives what they do not have. -->
<script setup lang="ts">
export interface CatalogueAbility { name: string, module: string, risk: 'normal' | 'privileged', implies: string[], label: string, held: boolean, on?: string | null, within?: string[] }

const props = defineProps<{
  catalogue: CatalogueAbility[]
  /** Read only, as for the Owner role or a viewer who cannot change roles. */
  disabled?: boolean
  /** The abilities confirmed already, for a fact: a privileged one not in it is marked unconfirmed. */
  confirmed?: string[]
  /** Only these are listed (a ticked one always is); what they imply is still worked out from the whole catalogue. */
  shown?: (ability: CatalogueAbility) => boolean
}>()
const chosen = defineModel<string[]>({ required: true })
const { t, te } = useT()

const byName = computed(() => new Map(props.catalogue.map(a => [a.name, a])))

/** What the ticked abilities bring with them, not counting an ability's own tick. */
const implied = computed(() => {
  const out = new Set<string>()
  const queue = chosen.value.flatMap(name => byName.value.get(name)?.implies ?? [])
  while (queue.length) {
    const name = queue.pop()!
    if (out.has(name)) continue
    out.add(name)
    queue.push(...(byName.value.get(name)?.implies ?? []))
  }
  return out
})

const groups = computed(() => {
  const out = new Map<string, CatalogueAbility[]>()
  for (const ability of props.catalogue) if (!props.shown || props.shown(ability) || isTicked(ability.name)) (out.get(ability.module) ?? out.set(ability.module, []).get(ability.module)!).push(ability)
  return [...out].map(([module, abilities]) => ({ module, abilities }))
})

/** An ability's name for people: its catalogue label, or its declared name made readable. */
function labelOf(ability: CatalogueAbility): string {
  if (te(ability.label)) return t(ability.label)
  const words = ability.name.slice(ability.module.length + 1).replace(/[.-]/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function moduleName(module: string): string {
  return te(`${module}.module.name`) ? t(`${module}.module.name`) : module
}

const isTicked = (name: string) => chosen.value.includes(name) || implied.value.has(name)
const isLocked = (ability: CatalogueAbility) => props.disabled || implied.value.has(ability.name) || (!ability.held && !chosen.value.includes(ability.name))

function toggle(name: string, on: boolean | 'indeterminate') {
  chosen.value = on === true ? [...new Set([...chosen.value, name])] : chosen.value.filter(a => a !== name)
}

function hint(ability: CatalogueAbility): string | undefined {
  if (implied.value.has(ability.name)) return t('core.roles.editor.comes-with')
  if (!ability.held && !chosen.value.includes(ability.name)) return t('core.roles.editor.not-held')
  if (ability.risk === 'privileged' && props.confirmed && isTicked(ability.name) && !props.confirmed.includes(ability.name)) return t('core.roles.editor.unconfirmed')
  return undefined
}
</script>

<template>
  <div class="space-y-6">
    <fieldset
      v-for="group in groups"
      :key="group.module"
      class="space-y-2"
    >
      <legend class="text-sm font-semibold text-highlighted mb-2">
        {{ moduleName(group.module) }}
      </legend>
      <div
        v-for="ability in group.abilities"
        :key="ability.name"
        class="flex items-start justify-between gap-3"
      >
        <div>
          <UCheckbox
            :id="`ability-${ability.name}`"
            :model-value="isTicked(ability.name)"
            :disabled="isLocked(ability)"
            :label="labelOf(ability)"
            :name="ability.name"
            :aria-describedby="hint(ability) ? `ability-${ability.name}-hint` : undefined"
            @update:model-value="toggle(ability.name, $event)"
          />
          <!-- Outside the checkbox, so a locked one's dimming does not take the hint below legible contrast. -->
          <p
            v-if="hint(ability)"
            :id="`ability-${ability.name}-hint`"
            class="ms-6 text-sm text-muted"
          >
            {{ hint(ability) }}
          </p>
        </div>
        <UBadge
          v-if="ability.risk === 'privileged'"
          color="warning"
          size="sm"
          :label="t('core.roles.editor.full-control')"
          class="shrink-0"
        />
      </div>
    </fieldset>
  </div>
</template>
