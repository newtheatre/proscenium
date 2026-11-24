<!-- A pinnable fact's mappings for one record each (Foundations, "A fact mapping may be pinned"):
     "holds this competency" for one competency, "holds this post" for the Treasurer. Each line names
     the record and what it gives; a record that has gone is marked broken and grants nothing. -->
<script setup lang="ts">
import type { CatalogueAbility } from './AbilityPicker.vue'

export interface PinnedMapping { record: string, title: string | null, abilities: { ability: string, confirmed: boolean }[] }

const props = defineProps<{
  fact: string
  /** The record type the fact is about, named in the headings ("For one post only"). */
  on: string
  /** The fact's name as the screen shows it, for the buttons' accessible names. */
  factName: string
  pinned: PinnedMapping[]
  catalogue: CatalogueAbility[]
  shown?: (ability: CatalogueAbility) => boolean
  summary: (abilities: string[]) => string
}>()
const emit = defineEmits<{ saved: [] }>()

const { t, te } = useT()
const typeKey = computed(() => `${props.on.split('.')[0]}.records.${props.on.split('.').slice(1).join('.')}`)
const type = computed(() => te(typeKey.value) ? t(typeKey.value).toLowerCase() : t('core.facts.pin.record'))
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()

// One line is edited at a time: an existing one by its record, or a new one once a record is chosen.
const editing = ref<string | null>(null)
const adding = ref(false)
const draft = ref<string[]>([])
const confirm = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const choice = ref<string | undefined>()

const { data: choices, execute: loadChoices, status: choicesStatus } = useAPI<{ records: { id: string, title: string }[] }>(
  () => `/api/core/facts/${encodeURIComponent(props.fact)}/choices` as '/api/core/facts/:fact/choices',
  { key: `core:fact-choices:${props.fact}`, immediate: false },
)
const items = computed(() => (choices.value?.records ?? [])
  .filter(r => !props.pinned.some(p => p.record === r.id))
  .map(r => ({ label: r.title, value: r.id })))

const privileged = computed(() => new Set(props.catalogue.filter(a => a.risk === 'privileged').map(a => a.name)))
const confirmedOf = (record: string) => props.pinned.find(p => p.record === record)?.abilities.filter(a => a.confirmed).map(a => a.ability) ?? []
const unconfirmed = computed(() => editing.value ? draft.value.filter(a => privileged.value.has(a) && !confirmedOf(editing.value!).includes(a)) : [])
const titleOf = (record: string) => props.pinned.find(p => p.record === record)?.title ?? items.value.find(i => i.value === record)?.label ?? record

function startAdding() {
  reset()
  adding.value = true
  loadChoices()
}
function change(record: string) {
  reset()
  editing.value = record
  draft.value = props.pinned.find(p => p.record === record)?.abilities.map(a => a.ability) ?? []
}
watch(choice, (record) => {
  if (!record) return
  editing.value = record
  draft.value = []
})
function reset() {
  editing.value = null
  adding.value = false
  choice.value = undefined
  draft.value = []
  confirm.value = false
  refusal.value = null
}

async function save(record: string, abilities: string[]) {
  refusal.value = null
  try {
    await $api(`/api/core/facts/${encodeURIComponent(props.fact)}` as '/api/core/facts/:fact', { method: 'PUT', body: { abilities, record, confirmPrivileged: confirm.value } })
    toast.add({ title: abilities.length ? t('core.facts.pin.saved', { record: titleOf(record) }) : t('core.facts.pin.removed', { record: titleOf(record) }), color: 'success' })
    reset()
    emit('saved')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <div class="space-y-3 border-t border-default pt-3">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-medium">
        {{ t('core.facts.pin.heading', { type }) }}
      </h3>
      <UButton
        v-if="!adding && !editing"
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-plus"
        :label="t('core.facts.pin.add', { type })"
        :aria-label="t('core.facts.pin.add-for', { fact: factName, type })"
        @click="startAdding"
      />
    </div>
    <p
      v-if="!pinned.length && !adding"
      class="text-sm text-muted"
    >
      {{ t('core.facts.pin.none', { type }) }}
    </p>
    <ul
      v-if="pinned.length"
      class="divide-y divide-default"
    >
      <li
        v-for="pin in pinned"
        :key="pin.record"
        class="py-2"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-medium">
              {{ pin.title ?? pin.record }}
              <UBadge
                v-if="pin.title === null"
                color="warning"
                variant="subtle"
                size="sm"
                class="ms-1"
                :label="t('core.facts.pin.broken')"
              />
            </p>
            <p class="text-sm text-muted">
              {{ pin.title === null ? t('core.facts.pin.broken-help', { type }) : summary(pin.abilities.map(a => a.ability)) }}
            </p>
          </div>
          <div
            v-if="editing !== pin.record"
            class="flex shrink-0 gap-2"
          >
            <UButton
              v-if="pin.title !== null"
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('core.facts.change')"
              :aria-label="t('core.facts.pin.change-for', { record: pin.title })"
              @click="change(pin.record)"
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :label="t('core.facts.pin.remove')"
              :aria-label="t('core.facts.pin.remove-for', { record: pin.title ?? pin.record })"
              loading-auto
              @click="save(pin.record, [])"
            />
          </div>
        </div>
      </li>
    </ul>
    <UFormField
      v-if="adding && !editing"
      :label="t('core.facts.pin.choose')"
    >
      <USelectMenu
        v-model="choice"
        :items="items"
        value-key="value"
        :loading="choicesStatus === 'pending'"
        :placeholder="t('core.facts.pin.choose-placeholder', { type })"
      />
    </UFormField>
    <template v-if="editing">
      <p class="text-sm font-medium">
        {{ t('core.facts.pin.editing', { record: titleOf(editing) }) }}
      </p>
      <RefusalNotice :refusal="refusal" />
      <AbilityPicker
        v-model="draft"
        :catalogue="catalogue"
        :confirmed="confirmedOf(editing)"
        :shown="shown"
      />
      <UCheckbox
        v-if="unconfirmed.length"
        v-model="confirm"
        :label="t('core.facts.confirm')"
        :description="t('core.facts.confirm-help')"
      />
    </template>
    <div
      v-if="adding || editing"
      class="flex justify-end gap-2"
    >
      <UButton
        color="neutral"
        variant="outline"
        :label="t('core.facts.cancel')"
        @click="reset"
      />
      <UButton
        v-if="editing"
        :label="t('core.facts.save')"
        :disabled="!draft.length"
        loading-auto
        @click="save(editing, draft)"
      />
    </div>
  </div>
</template>
