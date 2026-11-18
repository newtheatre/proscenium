<!-- A "record from a source" question as it is answered: the person types to search the source and
     chooses one record, or several. The answer is the records' ids; their names are fetched again
     to show an answer that was kept. A source this person may not search says so. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import type { Question, Value } from '../../shared/engine'

interface Found { id: string, label: string, detail?: string }
const props = defineProps<{ question: Question }>()
const model = defineModel<Value>()
const { t } = useT()
const { $api } = useNuxtApp()

const address = computed(() => `/api/forms/sources/${encodeURIComponent(props.question.source ?? '')}`)
const term = ref('')
const found = ref<Found[]>([])
const known = ref<Record<string, string>>({})
const loading = ref(false)
const failed = ref(false)
const shut = ref(false)

const ids = computed(() => typeof model.value === 'string' && model.value ? [model.value] : Array.isArray(model.value) ? (model.value as unknown[]).filter((v): v is string => typeof v === 'string') : [])
const items = computed(() => {
  const list = [...found.value]
  for (const id of ids.value) if (!list.some(f => f.id === id)) list.unshift({ id, label: known.value[id] ?? t('forms.screens.fill.record-chosen') })
  return list
})
const one = computed({ get: () => ids.value[0], set: (id: string | undefined) => { model.value = id || undefined } })
const many = computed({ get: () => ids.value, set: (list: string[]) => { model.value = list.length ? list : undefined } })

type Answer = { allowed: boolean, results: Found[], labels: Record<string, string> }
let latest = 0
async function ask(query: Record<string, string>): Promise<Answer | null> {
  const asked = ++latest
  loading.value = true
  failed.value = false
  try {
    const answer = await $api<Answer>(address.value as string, { query })
    if (asked !== latest) return null
    shut.value = !answer.allowed
    return answer
  }
  catch {
    if (asked === latest) failed.value = true
    return null
  }
  finally {
    if (asked === latest) loading.value = false
  }
}
async function search(q: string) {
  if (q.trim().length < 2) return void (found.value = [])
  const answer = await ask({ q: q.trim() })
  if (!answer) return
  found.value = answer.results
  for (const r of answer.results) known.value[r.id] = r.label
}
watchDebounced(term, q => search(q), { debounce: 250 }) // not-policy: a pause in typing

// The names of what is already chosen, and whether this person may search here at all.
onMounted(async () => {
  if (!props.question.source) return
  const answer = await ask(ids.value.length ? { ids: ids.value.join(',') } : {})
  if (answer) known.value = { ...known.value, ...answer.labels }
})
</script>

<template>
  <p
    v-if="shut"
    class="rounded-md border border-dashed border-default px-3 py-2 text-sm text-muted"
  >
    {{ t('forms.screens.fill.record-shut') }}
  </p>
  <USelectMenu
    v-else-if="question.multiple"
    v-model="many"
    v-model:search-term="term"
    :items="items"
    value-key="id"
    label-key="label"
    description-key="detail"
    multiple
    ignore-filter
    :loading="loading"
    :placeholder="t('forms.screens.fill.record-choose')"
    :search-input="{ placeholder: t('forms.screens.fill.record-search'), icon: 'i-lucide-search' }"
    :ui="{ placeholder: 'text-muted' }"
  >
    <template #empty>
      {{ failed ? t('forms.screens.fill.record-failed') : term.trim().length < 2 ? t('forms.screens.fill.record-type-more') : t('forms.screens.fill.record-none') }}
    </template>
  </USelectMenu>
  <USelectMenu
    v-else
    v-model="one"
    v-model:search-term="term"
    :items="items"
    value-key="id"
    label-key="label"
    description-key="detail"
    ignore-filter
    :loading="loading"
    :placeholder="t('forms.screens.fill.record-choose')"
    :search-input="{ placeholder: t('forms.screens.fill.record-search'), icon: 'i-lucide-search' }"
    :ui="{ placeholder: 'text-muted' }"
  >
    <template #empty>
      {{ failed ? t('forms.screens.fill.record-failed') : term.trim().length < 2 ? t('forms.screens.fill.record-type-more') : t('forms.screens.fill.record-none') }}
    </template>
  </USelectMenu>
</template>
