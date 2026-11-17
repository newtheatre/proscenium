<script setup lang="ts">
// One vocabulary (C-20, C-21): its terms in order, to add, rename, reorder, retire, restore and
// delete, each with the count of records that use it. A record stores the term's id, so a
// rename reaches every record and none is rewritten.

interface Term { id: string, slug: string, label: string, description: string | null, icon: string | null, seeded: boolean, retired: boolean, mergedIntoId: string | null, uses: number }
interface Vocabulary { key: string, owner: string, label: string, description: string | null, ordering: 'manual' | 'alphabetical', locked: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const key = computed(() => String(route.params.key))
const base = computed(() => `/api/core/vocabularies/${encodeURIComponent(key.value)}`)
const { data, status, error, refresh } = await useAPI<{ vocabulary: Vocabulary, terms: Term[] }>(base, { key: `core:vocabulary:${key.value}` })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const live = computed(() => data.value?.terms.filter(t => !t.retired) ?? [])
const retired = computed(() => data.value?.terms.filter(t => t.retired) ?? [])
const locked = computed(() => !!data.value?.vocabulary.locked)
const manual = computed(() => data.value?.vocabulary.ordering === 'manual')
// One call to the vocabulary's routes. The path is built at run time, so it is typed as a string.
function api(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: object = {}): Promise<unknown> {
  return $api<unknown>(`${base.value}${path}` as string, { method, body })
}
const labelOf = (id: string | null) => data.value?.terms.find(t => t.id === id)?.label ?? ''

async function run(fn: () => Promise<unknown>, done?: string) {
  refusal.value = null
  try {
    await fn()
    await refresh()
    if (done) toast.add({ title: done, color: 'success' })
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

const adding = reactive({ label: '' })
async function add() {
  const label = adding.label.trim()
  if (label && await run(() => api('/terms', 'POST', { label }), `Added ${label}`)) adding.label = ''
}

const editing = ref<string | null>(null)
const edit = reactive({ label: '' })
function startEdit(term: Term) {
  editing.value = term.id
  edit.label = term.label
}
async function saveEdit(term: Term) {
  const label = edit.label.trim()
  if (!label || label === term.label) return (editing.value = null)
  if (await run(() => api(`/terms/${term.id}`, 'PATCH', { label }), `Renamed to ${label}`)) editing.value = null
}

async function move(term: Term, by: -1 | 1) {
  const ids = data.value!.terms.map(t => t.id)
  const from = ids.indexOf(term.id)
  const order = live.value.map(t => t.id)
  const to = order.indexOf(term.id) + by
  if (to < 0 || to >= order.length) return
  const swap = ids.indexOf(order[to]!)
  ;[ids[from], ids[swap]] = [ids[swap]!, ids[from]!]
  await run(() => api('/order', 'PUT', { ids }))
}

const retire = (term: Term) => run(() => api(`/terms/${term.id}/retire`, 'POST'), `Retired ${term.label}`)
const restore = (term: Term) => run(() => api(`/terms/${term.id}/restore`, 'POST'), `Restored ${term.label}`)

async function remove(term: Term) {
  if (!await confirm({ verb: 'Delete', thing: `the term ${term.label}`, consequence: 'No record uses it, so nothing else changes. This cannot be undone.', button: 'Delete term' })) return
  await run(() => api(`/terms/${term.id}`, 'DELETE'), `Deleted ${term.label}`)
}

const uses = (term: Term) => t('core.counts.records', { count: term.uses })

const actions = (term: Term) => [[
  { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => startEdit(term) },
  ...(locked.value ? [] : [{ label: 'Retire', icon: 'i-lucide-archive', onSelect: () => retire(term) }]),
  ...(locked.value || term.uses > 0 || (term.seeded && data.value?.vocabulary.owner !== 'theatre') ? [] : [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(term) }]),
]]
</script>

<template>
  <PageFrame
    :title="data?.vocabulary.label ?? 'Vocabulary'"
    :description="data?.vocabulary.description ?? undefined"
    width="reading"
  >
    <template #status>
      <StatusBadge
        v-if="locked"
        tone="neutral"
        label="Locked"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <RefusalNotice :refusal="refusal" />

      <PageSection
        title="Terms"
        :description="locked
          ? 'Renaming a term renames it on every record. This vocabulary is locked: you can rename and reorder its terms, but not add, retire or delete them.'
          : 'Renaming a term renames it on every record. A term\'s label should never be a person\'s name.'"
      >
        <UForm
          v-if="!locked"
          :state="adding"
          @submit="add"
        >
          <UFieldGroup class="flex">
            <UInput
              v-model="adding.label"
              name="label"
              placeholder="New term"
              aria-label="New term"
              maxlength="80"
              class="flex-1"
            />
            <UButton
              type="submit"
              label="Add"
              icon="i-lucide-plus"
              :disabled="!adding.label.trim()"
            />
          </UFieldGroup>
        </UForm>

        <RecordList label="Terms">
          <RecordListItem
            v-for="(term, index) in live"
            :key="term.id"
            :icon="term.icon ?? undefined"
            :name="term.label"
            :description="uses(term)"
          >
            <template
              v-if="editing === term.id"
              #name
            >
              <UForm
                :state="edit"
                @submit="saveEdit(term)"
              >
                <UFieldGroup class="flex">
                  <UInput
                    v-model="edit.label"
                    name="label"
                    aria-label="Label"
                    maxlength="80"
                    class="flex-1"
                    autofocus
                    @keydown.esc="editing = null"
                  />
                  <UButton
                    type="submit"
                    label="Save"
                  />
                </UFieldGroup>
              </UForm>
            </template>
            <UFieldGroup v-if="manual">
              <IconButton
                icon="i-lucide-arrow-up"
                color="neutral"
                variant="outline"
                size="sm"
                :label="`Move ${term.label} up`"
                :disabled="index === 0"
                @click="move(term, -1)"
              />
              <IconButton
                icon="i-lucide-arrow-down"
                color="neutral"
                variant="outline"
                size="sm"
                :label="`Move ${term.label} down`"
                :disabled="index === live.length - 1"
                @click="move(term, 1)"
              />
            </UFieldGroup>
            <RowActions
              :items="actions(term)"
              :label="`Actions for ${term.label}`"
            />
          </RecordListItem>
        </RecordList>
      </PageSection>

      <PageSection
        v-if="retired.length"
        title="Retired"
        description="Retired terms are left out of every picker and still show on the records that use them."
      >
        <RecordList label="Retired terms">
          <RecordListItem
            v-for="term in retired"
            :key="term.id"
            :name="term.mergedIntoId ? `${term.label} (merged into ${labelOf(term.mergedIntoId)})` : term.label"
            :description="uses(term)"
            muted
          >
            <UButton
              v-if="!term.mergedIntoId && !locked"
              label="Restore"
              color="neutral"
              variant="outline"
              size="sm"
              @click="restore(term)"
            />
          </RecordListItem>
        </RecordList>
      </PageSection>
    </DataBoundary>
  </PageFrame>
</template>
