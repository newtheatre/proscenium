<script setup lang="ts">
// Collections (C-60): strands of productions with a page of their own, such as a festival or "Studio
// shorts". Archived ones fold under a divider below the rest. A new collection opens on its own page.

type State = 'draft' | 'published' | 'archived'
interface Collection { id: string, name: string, summary: string | null, colour: string, seasonId: string | null, season: string | null, state: State, productions: number }
interface Season { id: string, name: string, state: State }

const { t } = useT()
const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<{ collections: Collection[] }>('/api/core/collections', { key: 'core:collections' })
const { data: seasons } = await useAPI<{ rows: Season[] }>('/api/core/seasons', { key: 'core:seasons', query: { size: 100 } })
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const TONES = { draft: 'neutral', published: 'success', archived: 'info' } as const

const search = ref('')
const searching = ref(false)
const matching = computed(() => {
  const words = search.value.trim().toLowerCase()
  return (data.value?.collections ?? []).filter(c => !words || c.name.toLowerCase().includes(words))
})
const current = computed(() => matching.value.filter(c => c.state !== 'archived'))
const archived = computed(() => matching.value.filter(c => c.state === 'archived'))
const showArchived = ref(false)
watch(search, (words) => { if (words.trim() && archived.value.length) showArchived.value = true })
const describe = (c: Collection) => [c.season ?? t('core.collections.any-season'), t('core.collections.count', { count: c.productions })].join(' · ')

// A new collection: its name, colour and season, then the rest on its page.
const adding = ref(false)
const ANY = 'any' // the season select's value for a collection open to any season
const form = reactive({ name: '', colour: '#1d4ed8', seasonId: ANY })
const seasonItems = computed(() => [{ value: ANY, label: t('core.collections.any-season') }, ...(seasons.value?.rows ?? []).filter(s => s.state !== 'archived').map(s => ({ value: s.id, label: s.name }))])
const addForm = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('addForm')
function startAdding() {
  Object.assign(form, { name: '', colour: '#1d4ed8', seasonId: ANY })
  refusal.value = null
  adding.value = true
}
async function add() {
  refusal.value = null
  try {
    const { id } = await $api<{ id: string }>('/api/core/collections' as string, { method: 'POST', body: { name: form.name, colour: form.colour, seasonId: form.seasonId === ANY ? null : form.seasonId } })
    adding.value = false
    await navigateTo(`/console/programme/collections/${id}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
    addForm.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.collections.title')"
    :description="t('core.collections.description')"
    width="reading"
  >
    <template #primary>
      <SearchToggle
        v-if="data?.collections.length"
        v-model="search"
        v-model:open="searching"
        :label="t('core.collections.search')"
      />
      <UButton
        :label="t('core.collections.new')"
        :ui="{ label: searching ? 'max-sm:sr-only' : '' }"
        icon="i-lucide-plus"
        @click="startAdding()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <EmptyState
          v-if="!data?.collections.length"
          :title="t('core.collections.empty')"
          :description="t('core.collections.empty-description')"
          icon="i-lucide-library"
        />
        <template v-else>
          <p
            v-if="!matching.length"
            class="text-sm text-muted"
          >
            {{ t('core.collections.no-match', { search: search.trim() }) }}
          </p>
          <RecordList
            v-if="current.length"
            :label="t('core.collections.title')"
          >
            <RecordListItem
              v-for="c in current"
              :key="c.id"
              :to="`/console/programme/collections/${c.id}`"
              :name="c.name"
              :description="describe(c)"
            >
              <template #leading>
                <span
                  class="size-3 shrink-0 rounded-full"
                  :style="{ backgroundColor: c.colour }"
                  aria-hidden="true"
                />
              </template>
              <StatusBadge
                :tone="TONES[c.state]"
                :label="t(`core.states.${c.state}`)"
              />
            </RecordListItem>
          </RecordList>
          <CollapsibleDivider
            v-model:open="showArchived"
            :label="t('core.states.archived')"
            :count="archived.length"
          >
            <RecordList :label="t('core.collections.archived')">
              <RecordListItem
                v-for="c in archived"
                :key="c.id"
                :to="`/console/programme/collections/${c.id}`"
                :name="c.name"
                :description="describe(c)"
              />
            </RecordList>
          </CollapsibleDivider>
        </template>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="adding"
      :title="t('core.collections.new')"
      :description="t('core.collections.new-description')"
    >
      <template #body>
        <UForm
          id="collection-new"
          ref="addForm"
          :state="form"
          :validate="() => needs({ name: form.name, colour: form.colour })"
          class="space-y-4"
          novalidate
          @submit="add"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('core.collections.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            name="colour"
            :label="t('core.collections.colour')"
            :help="t('core.collections.colour-help')"
            required
          >
            <div class="flex flex-wrap items-center gap-3">
              <FieldColour v-model="form.colour" />
              <CollectionChip
                v-if="/^#[0-9a-f]{6}$/i.test(form.colour)"
                :name="form.name || t('core.collections.preview')"
                :colour="form.colour"
              />
            </div>
          </UFormField>
          <UFormField
            name="seasonId"
            :label="t('core.collections.season')"
            :help="t('core.collections.season-help')"
          >
            <USelect
              v-model="form.seasonId"
              :items="seasonItems"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="collection-new"
          :label="t('core.collections.add')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
