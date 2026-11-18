<!-- What other modules do once a response has taken a move (FB-506): each action a module offers,
     and which question's answer fills each thing it asks for. Shown only when a module that is
     switched on offers an action, or the move already carries one. -->
<script setup lang="ts">
import type { ActionUse, Transition } from '../../shared/engine'
import { questionsOf } from '../../shared/engine'

const props = defineProps<{ move: Transition, n: number }>()
const emit = defineEmits<{ change: [actions: ActionUse[]] }>()
const { t, te } = useT()
const builder = useBuilder()

const uses = computed(() => props.move.actions ?? [])
const offered = computed(() => builder.actions.value.map(a => ({ label: t(a.label), onSelect: () => add(a.key) })))
const known = (key: string) => builder.actions.value.find(a => a.key === key)
const name = (key: string) => known(key) ? t(known(key)!.label) : key
// A select cannot hold an empty value, so "nothing" has one of its own.
const NOTHING = '-'
/** The questions whose answers can fill an input: not one inside a repeating group, and of a type the action takes. */
const questions = (types?: string[]) => [
  { value: NOTHING, label: t('forms.screens.actions.nothing') },
  ...questionsOf(builder.definition.value).filter(q => !q.group && (!types || types.includes(q.question.type))).map(q => ({ value: q.question.id, label: q.question.label.trim() || t('forms.screens.builder.untitled') })),
]

function add(action: string) {
  const taken = uses.value.map(u => u.id)
  let n = taken.length + 1
  while (taken.includes(`action_${n}`)) n++
  emit('change', [...uses.value, { id: `action_${n}`, action, map: {} }])
}
const remove = (id: string) => emit('change', uses.value.filter(u => u.id !== id))
function map(id: string, input: string, question: string) {
  emit('change', uses.value.map((u) => {
    if (u.id !== id) return u
    return { ...u, map: Object.fromEntries([...Object.entries(u.map).filter(([key]) => key !== input), ...(question ? [[input, question]] : [])]) }
  }))
}
</script>

<template>
  <div
    v-if="uses.length || offered.length"
    class="space-y-2"
  >
    <div
      v-for="use in uses"
      :key="use.id"
      class="space-y-2 rounded-md bg-elevated/50 p-3"
    >
      <div class="flex items-center gap-2">
        <UIcon
          name="i-lucide-zap"
          class="size-4 shrink-0 text-muted"
        />
        <p class="min-w-0 flex-1 text-sm font-medium">
          {{ t('forms.screens.actions.then', { action: name(use.action) }) }}
        </p>
        <IconButton
          icon="i-lucide-x"
          size="sm"
          :label="t('forms.screens.actions.remove', { action: name(use.action), n })"
          @click="remove(use.id)"
        />
      </div>
      <p
        v-if="known(use.action)?.slot && te(`forms.screens.actions.only.${known(use.action)!.slot}`)"
        class="text-sm text-muted"
      >
        {{ t(`forms.screens.actions.only.${known(use.action)!.slot}`) }}
      </p>
      <div
        v-if="known(use.action)?.inputs.length"
        class="grid gap-2 sm:grid-cols-2"
      >
        <UFormField
          v-for="input in known(use.action)!.inputs"
          :key="input.key"
          :label="t(input.label)"
          :hint="input.required ? undefined : t('forms.screens.details.optional')"
          size="sm"
        >
          <USelect
            :model-value="use.map[input.key] ?? NOTHING"
            :items="questions(input.types)"
            class="min-w-48"
            @update:model-value="map(use.id, input.key, $event === NOTHING ? '' : String($event))"
          />
        </UFormField>
      </div>
    </div>
    <UDropdownMenu
      v-if="offered.length"
      :items="offered"
    >
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-zap"
        :label="t('forms.screens.actions.add')"
        :aria-label="t('forms.screens.actions.add-n', { n })"
      />
    </UDropdownMenu>
  </div>
</template>
