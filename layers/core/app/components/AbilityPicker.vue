<!-- The abilities a role or a fact brings, grouped by module (identity spec part 6, rule 6, after
     Flytower's role editor), and Core's by task: Programme, People, Settings and Messages. An ability
     that comes with one already ticked is ticked and locked; an ability that amounts to control over
     others or the theatre is marked; one the editor does not hold cannot be added, because nobody
     gives what they do not have. Each group can be ticked whole. A module that is switched off is
     left out unless something of it is ticked, and can be shown on request. -->
<script setup lang="ts">
export interface CatalogueAbility { name: string, module: string, risk: 'normal' | 'privileged', implies: string[], label: string, held: boolean, moduleOn?: boolean, on?: string | null, within?: string[] }

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

/** Core's abilities by task, from the first part of the name after `core.`; anything else is Settings. */
const CORE_SECTIONS = ['programme', 'people', 'settings', 'messages'] as const
type CoreSection = typeof CORE_SECTIONS[number]
const CORE_TASKS: Record<string, CoreSection> = {
  'production': 'programme', 'performance': 'programme', 'season': 'programme', 'programme': 'programme', 'venue': 'programme', 'closure': 'programme',
  'account': 'people', 'access-scheme': 'people', 'access-profile': 'people', 'data-request': 'people', 'session': 'people', 'role': 'people',
  'grant': 'people', 'identity-settings': 'people', 'retention': 'people', 'emergency-contact': 'people',
  'sender': 'messages', 'template': 'messages', 'notification': 'messages',
}
const coreSection = (name: string): CoreSection => CORE_TASKS[name.slice('core.'.length).split('.')[0]!] ?? 'settings'

interface Section { id: string, label?: string, abilities: CatalogueAbility[] }
interface Group { module: string, on: boolean, sections: Section[] }

const isTicked = (name: string) => chosen.value.includes(name) || implied.value.has(name)

const allGroups = computed<Group[]>(() => {
  const out = new Map<string, CatalogueAbility[]>()
  for (const ability of props.catalogue) if (!props.shown || props.shown(ability) || isTicked(ability.name)) (out.get(ability.module) ?? out.set(ability.module, []).get(ability.module)!).push(ability)
  return [...out].map(([module, abilities]) => {
    const on = abilities[0]?.moduleOn !== false
    if (module !== 'core') return { module, on, sections: [{ id: module, abilities }] }
    const sections = CORE_SECTIONS.map(id => ({ id: `core-${id}`, label: t(`core.roles.editor.sections.${id}`), abilities: abilities.filter(a => coreSection(a.name) === id) }))
    return { module, on, sections: sections.filter(s => s.abilities.length) }
  })
})
const showOff = ref(false)
/** A module that is off, with nothing of it ticked: left out until asked for. */
const hiddenOff = computed(() => allGroups.value.filter(g => !g.on && !g.sections.some(s => s.abilities.some(a => isTicked(a.name)))))
const groups = computed(() => showOff.value ? allGroups.value : allGroups.value.filter(g => !hiddenOff.value.includes(g)))

/** An ability's name for people: its catalogue label, or its declared name made readable. */
function labelOf(ability: CatalogueAbility): string {
  if (te(ability.label)) return t(ability.label)
  const words = ability.name.slice(ability.module.length + 1).replace(/[.-]/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function moduleName(module: string): string {
  return te(`${module}.module.name`) ? t(`${module}.module.name`) : module
}

const isLocked = (ability: CatalogueAbility) => props.disabled || implied.value.has(ability.name) || (!ability.held && !chosen.value.includes(ability.name))

function toggle(name: string, on: boolean | 'indeterminate') {
  chosen.value = on === true ? [...new Set([...chosen.value, name])] : chosen.value.filter(a => a !== name)
}

/** The abilities in a section that a tick of the whole section changes: those the editor may tick themselves. */
const tickable = (section: Section) => section.abilities.filter(a => !isLocked(a))
const allTicked = (section: Section) => tickable(section).every(a => chosen.value.includes(a.name))
function tickAll(section: Section) {
  const names = tickable(section).map(a => a.name)
  chosen.value = allTicked(section) ? chosen.value.filter(a => !names.includes(a)) : [...new Set([...chosen.value, ...names])]
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
      class="space-y-4"
    >
      <legend class="text-sm font-semibold text-highlighted mb-2">
        {{ moduleName(group.module) }}
        <span
          v-if="!group.on"
          class="font-normal text-muted"
        > · {{ t('core.roles.editor.module-off') }}</span>
      </legend>
      <div
        v-for="section in group.sections"
        :key="section.id"
        :role="section.label ? 'group' : undefined"
        :aria-labelledby="section.label ? `${section.id}-label` : undefined"
        class="space-y-2"
      >
        <div
          v-if="section.label || (!disabled && tickable(section).length)"
          class="flex flex-wrap items-center justify-between gap-2"
        >
          <p
            v-if="section.label"
            :id="`${section.id}-label`"
            class="text-sm font-medium text-toned"
          >
            {{ section.label }}
          </p>
          <UButton
            v-if="!disabled && tickable(section).length"
            size="xs"
            color="neutral"
            variant="link"
            class="ms-auto"
            :label="allTicked(section) ? t('core.roles.editor.untick-all') : t('core.roles.editor.tick-all')"
            :aria-label="allTicked(section)
              ? t('core.roles.editor.untick-all-in', { group: section.label ?? moduleName(group.module) })
              : t('core.roles.editor.tick-all-in', { group: section.label ?? moduleName(group.module) })"
            @click="tickAll(section)"
          />
        </div>
        <div
          v-for="ability in section.abilities"
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
      </div>
    </fieldset>
    <p
      v-if="hiddenOff.length"
      class="text-sm text-muted"
    >
      {{ showOff ? t('core.roles.editor.off-shown') : t('core.roles.editor.off-hidden', { modules: hiddenOff.map(g => moduleName(g.module)).join(', ') }) }}
      <UButton
        size="xs"
        color="neutral"
        variant="link"
        :label="showOff ? t('core.roles.editor.hide-off') : t('core.roles.editor.show-off')"
        @click="showOff = !showOff"
      />
    </p>
  </div>
</template>
