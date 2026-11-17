<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

// A production's credits (C-09): who made the show, by section, each with a printed name and a role,
// linked to a person's account or not. Credits move up and down within their section. A linked person
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

async function move(section: { id: string, credits: Credit[] }, index: number, by: -1 | 1) {
  const ids = section.credits.map(c => c.id)
  const [moved] = ids.splice(index, 1)
  ids.splice(index + by, 0, moved!)
  await act(() => $api<{ id: string }>(`${base.value}/order` as string, { method: 'PUT', body: { sectionTermId: section.id, ids } }))
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
          <RecordList :label="section.label">
            <RecordListItem
              v-for="(c, i) in section.credits"
              :key="c.id"
              :icon="c.accountId ? 'i-lucide-user-round-check' : 'i-lucide-user-round'"
              :name="`${c.creditedName}, ${c.role}`"
              :description="c.accountId ? `Linked to ${c.accountLabel ?? 'an account'}` : 'Not linked to an account'"
            >
              <div class="flex flex-wrap items-center justify-end gap-1">
                <StatusBadge
                  v-if="c.visibility !== 'public'"
                  :tone="TONES[c.visibility]"
                  :label="visibilityLabel(c.visibility)"
                />
                <IconButton
                  size="sm"
                  icon="i-lucide-arrow-up"
                  :label="`Move ${c.creditedName} up`"
                  :disabled="i === 0"
                  @click="move(section, i, -1)"
                />
                <IconButton
                  size="sm"
                  icon="i-lucide-arrow-down"
                  :label="`Move ${c.creditedName} down`"
                  :disabled="i === section.credits.length - 1"
                  @click="move(section, i, 1)"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  label="Edit"
                  :aria-label="`Edit ${c.creditedName}`"
                  @click="start(c)"
                />
                <IconButton
                  size="sm"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  :label="`Remove ${c.creditedName}`"
                  @click="remove(c)"
                />
              </div>
            </RecordListItem>
          </RecordList>
        </section>
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
          class="space-y-4"
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
            label="Printed name"
            required
          >
            <UInput
              v-model="form.creditedName"
              maxlength="120"
            />
          </UFormField>
          <UFormField
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
            <UFormField label="Section">
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
            :disabled="!form.creditedName.trim() || !form.role.trim() || !form.sectionTermId"
          />
        </div>
      </template>
    </UModal>
  </PageSection>
</template>
