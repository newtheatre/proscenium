<!-- Where wheelchair spaces come from (Matt 2026-11-17, 21:58): handed on (a run to each space's
     usual layout, a performance to its run), a seating layout, or numbers typed in. Used on a
     production's Tickets tab and on a performance's set-up; the parent saves what is chosen. -->
<script setup lang="ts">
import type { z } from 'zod'
import type { wheelchairChoice } from '../../server/input'

type Choice = z.input<typeof wheelchairChoice>
interface Layout { id: string, name: string, usual: boolean, spaceName?: string | null }

const props = defineProps<{ layouts: Layout[], current: Choice, inheritLabel: string, inheritDescription: string }>()
const emit = defineEmits<{ save: [choice: Choice] }>()
const { t } = useT()

const state = reactive({ use: 'inherit' as Choice['use'], layoutId: undefined as string | undefined, wheelchairSpaces: 2, seatsPerSpace: 2 })
watch(() => props.current, (c) => {
  state.use = c.use
  state.layoutId = c.use === 'layout' ? c.layoutId : undefined
  if (c.use === 'numbers') Object.assign(state, { wheelchairSpaces: c.wheelchairSpaces, seatsPerSpace: c.seatsPerSpace })
}, { immediate: true })

const ways = computed(() => [
  { value: 'inherit', label: props.inheritLabel, description: props.inheritDescription },
  ...(props.layouts.length ? [{ value: 'layout', label: t('box-office.layouts.choice.layout') }] : []),
  { value: 'numbers', label: t('box-office.layouts.choice.numbers') },
])
const items = computed(() => props.layouts.map((l) => {
  const name = l.usual ? t('box-office.layouts.usual-name', { name: l.name }) : l.name
  return { value: l.id, label: l.spaceName ? `${name}, ${l.spaceName}` : name }
}))

function chosen(): Choice | null {
  if (state.use === 'inherit') return { use: 'inherit' }
  if (state.use === 'layout') return state.layoutId ? { use: 'layout', layoutId: state.layoutId } : null
  return { use: 'numbers', wheelchairSpaces: state.wheelchairSpaces, seatsPerSpace: state.seatsPerSpace }
}
const unchanged = computed(() => JSON.stringify(chosen()) === JSON.stringify(props.current))
function submit() {
  const choice = chosen()
  if (choice) emit('save', choice)
}
</script>

<template>
  <UForm
    :state="state"
    class="space-y-4"
    novalidate
    @submit="submit"
  >
    <UFormField
      :label="t('box-office.layouts.choice.legend')"
      name="use"
    >
      <URadioGroup
        v-model="state.use"
        :items="ways"
      />
    </UFormField>
    <UFormField
      v-if="state.use === 'layout'"
      :label="t('box-office.layouts.performance.layout')"
      name="layoutId"
      required
    >
      <USelect
        v-model="state.layoutId"
        :items="items"
        :placeholder="t('box-office.layouts.performance.placeholder')"
      />
    </UFormField>
    <div
      v-if="state.use === 'numbers'"
      class="grid gap-4 sm:grid-cols-2"
    >
      <UFormField
        :label="t('box-office.layouts.spaces-label')"
        name="wheelchairSpaces"
        required
      >
        <UInputNumber
          v-model="state.wheelchairSpaces"
          :min="0"
          :max="500"
        />
      </UFormField>
      <UFormField
        :label="t('box-office.layouts.each-label')"
        name="seatsPerSpace"
        :help="t('box-office.layouts.each-help')"
        required
      >
        <UInputNumber
          v-model="state.seatsPerSpace"
          :min="0"
          :max="20"
        />
      </UFormField>
    </div>
    <UButton
      type="submit"
      color="neutral"
      variant="outline"
      :label="t('box-office.layouts.choice.save')"
      :disabled="unchanged || (state.use === 'layout' && !state.layoutId)"
    />
  </UForm>
</template>
