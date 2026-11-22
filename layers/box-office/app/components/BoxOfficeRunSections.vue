<!-- A production's sections (the priced parts of the house), on its Tickets tab: listed, renamed in
     a dialogue, removed while nothing is priced or sold in them, and added. Every performance of the
     production shares them, so they are kept here and nowhere else. -->
<script setup lang="ts">
interface Section { id: string, name: string, kind: string, sort: number }

const props = defineProps<{ productionId: string, sections: Section[] }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const url = computed(() => `/api/box-office/productions/${encodeURIComponent(props.productionId)}/bands`)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

// Does the act, then says so, with an Undo that does its reverse where there is one.
async function act(run: () => Promise<unknown>, done: string, undo?: () => Promise<unknown>): Promise<boolean> {
  refusal.value = null
  try {
    await run()
    emit('changed')
    offer(done, undo && (async () => {
      await undo()
      emit('changed')
    }))
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

// A wheelchair space is a ticket type tied to the access scheme, not a section, so a new section is
// seats or restricted view.
const adding = ref({ name: '', kind: 'standard' as 'standard' | 'restricted_view' })
const kinds = computed(() => (['standard', 'restricted_view'] as const).map(value => ({ value, label: t(`box-office.setup.bands.kind.${value}`) })))
async function add() {
  if (await act(() => $api(url.value, { method: 'POST', body: { name: adding.value.name.trim(), kind: adding.value.kind, sort: props.sections.length } }), t('box-office.setup.bands.added'))) adding.value = { name: '', kind: 'standard' }
}

const renaming = ref<Section | null>(null)
const newName = ref('')
const renameOpen = computed({ get: () => !!renaming.value, set: (v) => { if (!v) renaming.value = null } })
function startRename(s: Section) {
  newName.value = s.name
  renaming.value = s
}
async function rename() {
  const s = renaming.value
  if (!s) return
  const one = `${url.value}/${encodeURIComponent(s.id)}`
  if (await act(() => $api(one, { method: 'PATCH', body: { name: newName.value.trim() } }), t('box-office.setup.bands.renamed'), () => $api(one, { method: 'PATCH', body: { name: s.name } }))) renaming.value = null
}
async function remove(s: Section) {
  await act(() => $api(`${url.value}/${encodeURIComponent(s.id)}`, { method: 'DELETE' }), t('box-office.setup.bands.removed', { name: s.name }),
    () => $api(url.value, { method: 'POST', body: { name: s.name, kind: s.kind, sort: s.sort } }))
}
const actions = (s: Section) => [[
  { label: t('box-office.setup.bands.rename'), icon: 'i-lucide-pencil', onSelect: () => startRename(s) },
  { label: t('box-office.setup.bands.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void remove(s) } },
]]
</script>

<template>
  <PageSection
    id="sections"
    :title="t('box-office.setup.bands.title')"
    :description="t('box-office.setup.bands.description')"
  >
    <RefusalNotice :refusal="refusal" />
    <RecordList
      v-if="sections.length"
      :label="t('box-office.setup.bands.title')"
    >
      <RecordListItem
        v-for="s in sections"
        :key="s.id"
        :name="s.name"
        :description="t(`box-office.setup.bands.kind.${s.kind}`)"
      >
        <RowActions
          :items="actions(s)"
          :label="t('box-office.setup.bands.actions', { name: s.name })"
        />
      </RecordListItem>
    </RecordList>
    <UForm
      class="flex flex-wrap items-end gap-2"
      :state="adding"
      :validate="() => needs({ name: adding.name })"
      novalidate
      @submit="add"
    >
      <UFormField
        name="name"
        :label="t('box-office.setup.bands.name')"
        class="grow"
      >
        <UInput
          v-model="adding.name"
          maxlength="60"
        />
      </UFormField>
      <UFormField :label="t('box-office.setup.bands.kind.label')">
        <USelect
          v-model="adding.kind"
          :items="kinds"
        />
      </UFormField>
      <UButton
        type="submit"
        :label="t('box-office.setup.bands.add')"
        color="neutral"
        variant="outline"
      />
    </UForm>
    <UModal
      v-model:open="renameOpen"
      :title="t('box-office.setup.bands.rename')"
    >
      <template #body>
        <UForm
          class="flex items-end gap-2"
          :state="{ newName }"
          :validate="() => needs({ newName })"
          novalidate
          @submit="rename"
        >
          <UFormField
            name="newName"
            :label="t('box-office.setup.bands.name')"
            class="grow"
          >
            <UInput
              v-model="newName"
              maxlength="60"
              autofocus
            />
          </UFormField>
          <UButton
            type="submit"
            :label="t('box-office.setup.bands.rename')"
          />
        </UForm>
      </template>
    </UModal>
  </PageSection>
</template>
