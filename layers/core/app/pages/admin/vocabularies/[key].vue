<script setup lang="ts">
// One vocabulary (C-20, C-21): its terms in order, to add, rename, reorder, retire, restore and
// delete, each with the count of records that use it. A record stores the term's id, so a
// rename reaches every record and none is rewritten.
definePageMeta({ layout: 'admin' })

interface Term { id: string, slug: string, label: string, description: string | null, icon: string | null, seeded: boolean, retired: boolean, mergedIntoId: string | null, uses: number }
interface Vocabulary { key: string, owner: string, label: string, description: string | null, ordering: 'manual' | 'alphabetical', locked: boolean }

const route = useRoute()
const key = computed(() => String(route.params.key))
const base = computed(() => `/api/core/vocabularies/${encodeURIComponent(key.value)}`)
const { data, status, error, refresh } = await useFetch<{ vocabulary: Vocabulary, terms: Term[] }>(base, { key: `core:vocabulary:${key.value}` })
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
  return $fetch<unknown>(`${base.value}${path}` as string, { method, body })
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

const adding = ref('')
async function add() {
  const label = adding.value.trim()
  if (label && await run(() => api('/terms', 'POST', { label }), `Added ${label}`)) adding.value = ''
}

const editing = ref<string | null>(null)
const editLabel = ref('')
function startEdit(term: Term) {
  editing.value = term.id
  editLabel.value = term.label
}
async function saveEdit(term: Term) {
  const label = editLabel.value.trim()
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
      <div class="space-y-6">
        <RefusalNotice :refusal="refusal" />
        <p class="text-sm text-muted">
          Records keep the term they chose, so renaming a term renames it on every record. A term's label should never be a person's name.
          <template v-if="locked">
            This vocabulary is locked: you can rename and reorder its terms, but not add, retire or delete them.
          </template>
        </p>

        <form
          v-if="!locked"
          class="flex gap-2"
          @submit.prevent="add"
        >
          <UInput
            v-model="adding"
            placeholder="New term"
            aria-label="New term"
            maxlength="80"
            class="flex-1"
          />
          <UButton
            type="submit"
            label="Add"
            icon="i-lucide-plus"
            :disabled="!adding.trim()"
          />
        </form>

        <ul
          class="divide-y divide-default rounded-lg border border-default"
          aria-label="Terms"
        >
          <li
            v-for="(term, index) in live"
            :key="term.id"
            class="flex items-center gap-3 px-3 py-2"
          >
            <UIcon
              v-if="term.icon"
              :name="term.icon"
              class="size-4 shrink-0 text-muted"
            />
            <form
              v-if="editing === term.id"
              class="flex flex-1 gap-2"
              @submit.prevent="saveEdit(term)"
            >
              <UInput
                v-model="editLabel"
                aria-label="Label"
                maxlength="80"
                class="flex-1"
                autofocus
                @keydown.esc="editing = null"
              />
              <UButton
                type="submit"
                label="Save"
                size="sm"
              />
            </form>
            <span
              v-else
              class="flex-1"
            >{{ term.label }}</span>
            <span class="text-sm text-muted">{{ term.uses === 1 ? '1 record' : `${term.uses} records` }}</span>
            <template v-if="manual">
              <UButton
                icon="i-lucide-arrow-up"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Move ${term.label} up`"
                :disabled="index === 0"
                @click="move(term, -1)"
              />
              <UButton
                icon="i-lucide-arrow-down"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Move ${term.label} down`"
                :disabled="index === live.length - 1"
                @click="move(term, 1)"
              />
            </template>
            <UDropdownMenu :items="actions(term)">
              <UButton
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Actions for ${term.label}`"
              />
            </UDropdownMenu>
          </li>
        </ul>

        <section
          v-if="retired.length"
          class="space-y-2"
        >
          <h2 class="text-sm font-semibold">
            Retired
          </h2>
          <p class="text-sm text-muted">
            Retired terms are left out of every picker and still show on the records that use them.
          </p>
          <ul class="divide-y divide-default rounded-lg border border-default">
            <li
              v-for="term in retired"
              :key="term.id"
              class="flex items-center gap-3 px-3 py-2 text-muted"
            >
              <span class="flex-1">
                {{ term.label }}
                <template v-if="term.mergedIntoId">(merged into {{ labelOf(term.mergedIntoId) }})</template>
              </span>
              <span class="text-sm">{{ term.uses === 1 ? '1 record' : `${term.uses} records` }}</span>
              <UButton
                v-if="!term.mergedIntoId && !locked"
                label="Restore"
                color="neutral"
                variant="outline"
                size="sm"
                @click="restore(term)"
              />
            </li>
          </ul>
        </section>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
