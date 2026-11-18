<!-- Price lists (S12): Standard, which always exists, and any others such as Committee or Staff. A
     list is priced by hand, falling back to Standard where it has no price, or is a percentage off
     Standard with no prices of its own. A restricted list needs its own ability to choose at the till.
     Retired lists sit below a divider. -->
<script setup lang="ts">
import { priceListInput, priceListPatch } from '../../../../../../server/input'

interface List { id: string, name: string, standard: boolean, restricted: boolean, fallsBack: boolean, percentOff: number | null, active: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const { offer } = useUndo()
const { data, status, error, refresh } = await useAPI<{ lists: List[] }>('/api/bar/price-lists', { key: 'bar:price-lists' })

function describe(l: List): string {
  const how = l.standard
    ? t('bar.screens.lists.standard')
    : l.percentOff !== null ? t('bar.screens.lists.percent', { percent: l.percentOff }) : l.fallsBack ? t('bar.screens.lists.by-hand-falls-back') : t('bar.screens.lists.by-hand')
  return [how, l.restricted ? t('bar.screens.lists.restricted') : null].filter(Boolean).join(' · ')
}

const query = ref('')
const searching = ref(false)
const showRetired = ref(false)
const shown = computed(() => (data.value?.lists ?? []).filter(l => l.name.toLowerCase().includes(query.value.trim().toLowerCase())))
const current = computed(() => shown.value.filter(l => l.active))
const retired = computed(() => shown.value.filter(l => !l.active))

const form = ref<{ id: string | null, standard: boolean, name: string, restricted: boolean, fallsBack: boolean, pricing: 'hand' | 'percent', percentOff: number | null } | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
type FormRef = { setErrors: (errors: FieldError[]) => void }
const formEl = useTemplateRef<FormRef>('formEl')
const pricingItems = computed(() => [{ value: 'hand', label: t('bar.screens.lists.pricing-hand') }, { value: 'percent', label: t('bar.screens.lists.pricing-percent') }])
function edit(l?: List) {
  refusal.value = null
  form.value = l
    ? { id: l.id, standard: l.standard, name: l.name, restricted: l.restricted, fallsBack: l.fallsBack, pricing: l.percentOff === null ? 'hand' : 'percent', percentOff: l.percentOff }
    : { id: null, standard: false, name: '', restricted: false, fallsBack: true, pricing: 'hand', percentOff: null }
}
const listBody = () => {
  const f = form.value!
  return f.standard
    ? { name: f.name, restricted: f.restricted }
    : { name: f.name, restricted: f.restricted, fallsBack: f.fallsBack, percentOff: f.pricing === 'percent' ? f.percentOff : null }
}
// A percentage list needs its percentage, which the schema cannot say on its own (null is "by hand").
const validate = () => [
  ...bodyErrors(form.value?.id ? priceListPatch : priceListInput, listBody()),
  ...needs({ percentOff: !form.value?.standard && form.value?.pricing === 'percent' ? form.value.percentOff : true }),
]
async function save() {
  const f = form.value!
  refusal.value = null
  const body = listBody()
  try {
    if (f.id) {
      // Undo puts back what it was.
      const was = data.value?.lists.find(l => l.id === f.id)
      const id = f.id
      await $api(`/api/bar/price-lists/${id}` as string, { method: 'PATCH', body })
      offer(t('bar.screens.lists.saved'), was && (async () => {
        await $api(`/api/bar/price-lists/${id}` as string, { method: 'PATCH', body: was.standard ? { name: was.name, restricted: was.restricted } : { name: was.name, restricted: was.restricted, fallsBack: was.fallsBack, percentOff: was.percentOff } })
        await refresh()
      }))
    }
    else {
      await $api('/api/bar/price-lists', { method: 'POST', body })
      toast.add({ title: t('bar.screens.lists.saved'), color: 'success' })
    }
    form.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
async function setActive(l: List, active: boolean) {
  try {
    await $api(`/api/bar/price-lists/${l.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
    offer(active ? t('bar.screens.lists.restored', { name: l.name }) : t('bar.screens.lists.retired', { name: l.name }), async () => {
      await $api(`/api/bar/price-lists/${l.id}` as string, { method: 'PATCH', body: { active: !active } })
      await refresh()
    })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.price-lists.label')">
    <template #primary>
      <div class="flex items-center gap-2">
        <SearchToggle
          v-model="query"
          v-model:open="searching"
          :label="t('bar.screens.lists.search')"
        />
        <UButton
          icon="i-lucide-plus"
          :label="t('bar.screens.lists.new')"
          :ui="{ label: searching ? 'max-sm:sr-only' : '' }"
          @click="edit()"
        />
      </div>
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template v-if="data">
        <EmptyState
          v-if="!data.lists.length"
          icon="i-lucide-tags"
          :title="t('bar.screens.lists.empty-title')"
          :description="t('bar.screens.lists.empty')"
        >
          <template #actions>
            <UButton
              icon="i-lucide-plus"
              :label="t('bar.screens.lists.new')"
              @click="edit()"
            />
          </template>
        </EmptyState>
        <div
          v-else
          class="space-y-4"
        >
          <p
            v-if="!shown.length"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.lists.no-match') }}
          </p>
          <RecordList
            v-if="current.length"
            :label="t('bar.navigation.price-lists.label')"
          >
            <RecordListItem
              v-for="l in current"
              :key="l.id"
              :description="describe(l)"
              :muted="!l.active"
            >
              <template #name>
                <ULink :to="`/admin/modules/bar/price-lists/${l.id}`">
                  {{ l.name }}
                </ULink>
              </template>
              <RowActions
                :label="t('bar.screens.lists.actions', { name: l.name })"
                :items="[
                  { label: t('bar.screens.lists.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(l) },
                  ...(l.standard ? [] : [l.active
                    ? { label: t('bar.screens.lists.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(l, false) }
                    : { label: t('bar.screens.lists.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(l, true) }]),
                ]"
              />
            </RecordListItem>
          </RecordList>
          <CollapsibleDivider
            :open="showRetired || !!query.trim()"
            :label="t('bar.screens.lists.retired-list')"
            :count="retired.length"
            @update:open="v => showRetired = v"
          >
            <RecordList :label="t('bar.screens.lists.retired-list')">
              <RecordListItem
                v-for="l in retired"
                :key="l.id"
                :description="describe(l)"
                :muted="!l.active"
              >
                <template #name>
                  <ULink :to="`/admin/modules/bar/price-lists/${l.id}`">
                    {{ l.name }}
                  </ULink>
                </template>
                <RowActions
                  :label="t('bar.screens.lists.actions', { name: l.name })"
                  :items="[
                    { label: t('bar.screens.lists.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(l) },
                    ...(l.standard ? [] : [l.active
                      ? { label: t('bar.screens.lists.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(l, false) }
                      : { label: t('bar.screens.lists.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(l, true) }]),
                  ]"
                />
              </RecordListItem>
            </RecordList>
          </CollapsibleDivider>
        </div>
      </template>
    </DataBoundary>

    <UModal
      :open="!!form"
      :title="form?.id ? t('bar.screens.lists.edit') : t('bar.screens.lists.new')"
      @update:open="v => { if (!v) form = null }"
    >
      <template #body>
        <UForm
          v-if="form"
          id="bar-list"
          ref="formEl"
          :state="form"
          :validate="validate"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.lists.name')"
            name="name"
            required
          >
            <UInput v-model="form.name" />
          </UFormField>
          <template v-if="!form.standard">
            <UFormField
              :label="t('bar.screens.lists.pricing')"
              name="pricing"
            >
              <USelect
                v-model="form.pricing"
                :items="pricingItems"
              />
            </UFormField>
            <UFormField
              v-if="form.pricing === 'percent'"
              :label="t('bar.screens.lists.percent-off')"
              :help="t('bar.screens.lists.percent-off-help')"
              name="percentOff"
              required
            >
              <UInputNumber
                v-model="form.percentOff"
                :min="1"
                :max="100"
              />
            </UFormField>
            <UCheckbox
              v-else
              v-model="form.fallsBack"
              :label="t('bar.screens.lists.falls-back')"
              :description="t('bar.screens.lists.falls-back-help')"
            />
          </template>
          <UCheckbox
            v-model="form.restricted"
            :label="t('bar.screens.lists.restricted-label')"
            :description="t('bar.screens.lists.restricted-help')"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-list"
          loading-auto
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
