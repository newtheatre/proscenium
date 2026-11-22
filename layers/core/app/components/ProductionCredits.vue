<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { watchDebounced } from '@vueuse/core'

// A production's credits (C-09): who made the show, by section, each with a printed name and a role,
// linked to a person's account or not. Credits are dragged into order within their section. A linked person
// is told, and may change who sees their own credit from their account.
type Visibility = 'public' | 'members' | 'hidden'
interface Credit {
  id: string
  accountId: string | null
  accountLabel: string | null
  creditedName: string
  role: string
  sectionTermId: string
  visibility: Visibility
  sort: number
}
interface Section { id: string, label: string, retired: boolean }
interface Person { id: string, label: string }

const props = defineProps<{ productionId: string, creditsPublic: boolean }>()

const { $api } = useNuxtApp()
const base = computed(() => `/api/core/productions/${props.productionId}/credits`)
const { data, status, error, refresh } = await useAPI<{ credits: Credit[], sections: Section[] }>(base, { key: `core:production:${props.productionId}:credits` })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const VISIBILITY = [
  { value: 'public', label: 'Anyone' },
  { value: 'members', label: 'Members only' },
  { value: 'hidden', label: 'Hidden' },
] as const
const TONES = { public: 'success', members: 'info', hidden: 'neutral' } as const
const visibilityLabel = (v: Visibility) => VISIBILITY.find(o => o.value === v)!.label

/** The sections in the vocabulary's order, each with its credits; a retired section shows while it has some. */
const grouped = computed(() => (data.value?.sections ?? [])
  .map(s => ({ ...s, credits: (data.value?.credits ?? []).filter(c => c.sectionTermId === s.id) }))
  .filter(s => !s.retired || s.credits.length))
const sectionItems = computed(() => (data.value?.sections ?? []).filter(s => !s.retired || s.id === form.value.sectionTermId).map(s => ({ value: s.id, label: s.label })))

async function act(fn: () => Promise<unknown>, done?: string) {
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

// Adding and editing
const open = ref(false)
const editing = ref<Credit | null>(null)
const form = ref({ creditedName: '', role: '', sectionTermId: '', visibility: 'public' as Visibility, person: undefined as Person | undefined })
function start(credit?: Credit, sectionTermId?: string) {
  editing.value = credit ?? null
  refusal.value = null
  form.value = credit
    ? { creditedName: credit.creditedName, role: credit.role, sectionTermId: credit.sectionTermId, visibility: credit.visibility, person: credit.accountId ? { id: credit.accountId, label: credit.accountLabel ?? 'Unnamed person' } : undefined }
    : { creditedName: '', role: '', sectionTermId: sectionTermId ?? sectionItems.value[0]?.value ?? '', visibility: 'public', person: undefined }
  open.value = true
}

// The person picker searches as the editor types. Someone who may not search people can still enter
// a printed name; the credit is simply not linked.
const search = ref('')
const people = ref<Person[]>([])
const searching = ref(false)
watchDebounced(search, async (q) => {
  if (q.trim().length < 2) {
    people.value = []
    return
  }
  searching.value = true
  try {
    people.value = (await $api<{ people: Person[] }>('/api/core/accounts', { query: { q } })).people
  }
  catch {
    people.value = []
  }
  finally {
    searching.value = false
  }
}, { debounce: 250 }) // not-policy: typing pause before a search
const personItems = computed(() => {
  const picked = form.value.person
  return picked && !people.value.some(p => p.id === picked.id) ? [picked, ...people.value] : people.value
})
watch(() => form.value.person, (p) => {
  if (p && !form.value.creditedName.trim()) form.value.creditedName = p.label
})

async function save() {
  const body = {
    creditedName: form.value.creditedName,
    role: form.value.role,
    sectionTermId: form.value.sectionTermId,
    visibility: form.value.visibility,
    accountId: form.value.person?.id ?? null,
  }
  const ok = editing.value
    ? await act(() => $api<{ id: string }>(`${base.value}/${editing.value!.id}` as string, { method: 'PATCH', body }), 'Credit saved')
    : await act(() => $api<{ id: string }>(base.value as string, { method: 'POST', body }), 'Credit added')
  if (ok) open.value = false
}

async function remove(credit: Credit) {
  if (!await confirm({ verb: 'Remove', thing: `${credit.creditedName}, ${credit.role}`, consequence: 'The credit leaves this production\'s list.', button: 'Remove credit' })) return
  await act(() => $api<{ id: string }>(`${base.value}/${credit.id}` as string, { method: 'DELETE', body: {} }), 'Credit removed')
}

// A credit moves within its section: dragged by its handle, with the arrow keys on the handle, or
// from its menu. The list is put in the new order at once and the saved order follows.
type Grouped = { id: string, credits: Credit[] }
const moved = ref('')
async function place(section: Grouped, from: number, to: number) {
  if (to < 0 || to >= section.credits.length || from === to) return
  const ids = section.credits.map(c => c.id)
  const [id] = ids.splice(from, 1)
  ids.splice(to, 0, id!)
  const credit = section.credits[from]!
  if (data.value) {
    const rest = data.value.credits.filter(c => c.sectionTermId !== section.id)
    data.value = { ...data.value, credits: [...rest, ...ids.map(i => section.credits.find(c => c.id === i)!)] }
  }
  const ok = await act(() => $api<{ id: string }>(`${base.value}/order` as string, { method: 'PUT', body: { sectionTermId: section.id, ids } }))
  if (ok) moved.value = `${credit.creditedName} is now ${to + 1} of ${ids.length}`
  else await refresh()
}
async function onHandleKey(event: KeyboardEvent, section: Grouped, index: number) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  const id = section.credits[index]!.id
  // The row is drawn again in its new place, and again when the saved order returns: keep the keyboard on its handle.
  const keepFocus = () => document.querySelector<HTMLElement>(`[data-drag-handle="${id}"]`)?.focus()
  const saving = place(section, index, index + by)
  await nextTick()
  keepFocus()
  await saving
  await nextTick()
  keepFocus()
}
function actions(section: Grouped, c: Credit, i: number): DropdownMenuItem[][] {
  return [
    [{ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => start(c) }],
    [
      { label: 'Move up', icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => { void place(section, i, i - 1) } },
      { label: 'Move down', icon: 'i-lucide-arrow-down', disabled: i === section.credits.length - 1, onSelect: () => { void place(section, i, i + 1) } },
    ],
    [{ label: 'Remove', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void remove(c) } }],
  ]
}
</script>

<template>
  <PageSection
    title="Credits"
    description="Who made the show. A credit linked to someone's account tells them, and they can choose who sees it."
  >
    <template #actions>
      <UButton
        label="Add credit"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :disabled="!sectionItems.length"
        @click="start()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <RefusalNotice
          v-if="!open"
          :refusal="refusal"
        />
        <UAlert
          v-if="!props.creditsPublic && data?.credits.length"
          color="neutral"
          icon="i-lucide-eye-off"
          title="This production's credits are not shown on its public page."
        />
        <EmptyState
          v-if="data && !data.credits.length"
          icon="i-lucide-scroll-text"
          title="No credits yet"
          description="Add the cast, creative team and crew."
        />
        <section
          v-for="section in grouped.filter(s => s.credits.length)"
          :key="section.id"
          :aria-labelledby="`credits-${section.id}`"
          class="space-y-2"
        >
          <h3
            :id="`credits-${section.id}`"
            class="font-medium text-highlighted"
          >
            {{ section.label }}
          </h3>
          <SortableList
            :label="section.label"
            @reorder="({ from, to }) => place(section, from, to)"
          >
            <SortableRow
              v-for="(c, i) in section.credits"
              :id="c.id"
              :key="c.id"
              :index="i"
              :icon="c.accountId ? 'i-lucide-user-round-check' : 'i-lucide-user-round'"
              :name="`${c.creditedName}, ${c.role}`"
              :description="c.accountId ? `Linked to ${c.accountLabel ?? 'an account'}` : 'Not linked to an account'"
            >
              <template #leading>
                <IconButton
                  v-if="section.credits.length > 1"
                  :data-drag-handle="c.id"
                  icon="i-lucide-grip-vertical"
                  size="sm"
                  class="cursor-grab touch-none"
                  :label="`Drag to move ${c.creditedName}`"
                  aria-describedby="credits-order-help"
                  @keydown="onHandleKey($event, section, i)"
                />
              </template>
              <StatusBadge
                v-if="c.visibility !== 'public'"
                :tone="TONES[c.visibility]"
                :label="visibilityLabel(c.visibility)"
              />
              <RowActions
                :items="actions(section, c, i)"
                :label="`Actions for ${c.creditedName}`"
              />
            </SortableRow>
          </SortableList>
        </section>
        <span
          id="credits-order-help"
          class="sr-only"
        >Press the up or down arrow to move this credit, or drag it.</span>
        <span
          class="sr-only"
          aria-live="polite"
        >{{ moved }}</span>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="editing ? 'Edit credit' : 'Add credit'"
      description="The printed name and role appear as they would in a printed programme."
    >
      <template #body>
        <UForm
          id="credit-form"
          :state="form"
          :validate="() => needs({ creditedName: form.creditedName, role: form.role, sectionTermId: form.sectionTermId })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Person"
            help="Optional. Linking tells them and lets them choose who sees the credit."
          >
            <UInputMenu
              v-model="form.person"
              v-model:search-term="search"
              :items="personItems"
              :loading="searching"
              ignore-filter
              placeholder="Search by name or email address"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="creditedName"
            label="Printed name"
            required
          >
            <UInput
              v-model="form.creditedName"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="role"
            label="Role"
            help="Such as Director or Ophelia."
            required
          >
            <UInput
              v-model="form.role"
              maxlength="120"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              name="sectionTermId"
              label="Section"
            >
              <USelect
                v-model="form.sectionTermId"
                :items="sectionItems"
              />
            </UFormField>
            <UFormField label="Who sees it">
              <USelect
                v-model="form.visibility"
                :items="[...VISIBILITY]"
              />
            </UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="open = false"
          />
          <UButton
            type="submit"
            form="credit-form"
            :label="editing ? 'Save credit' : 'Add credit'"
          />
        </div>
      </template>
    </UModal>
  </PageSection>
</template>
