<!-- Price lists (S12): Standard, which always exists, and any others such as Committee or Staff. A
     list is priced by hand, falling back to Standard where it has no price, or is a percentage off
     Standard with no prices of its own. A restricted list needs its own ability to choose at the till. -->
<script setup lang="ts">
interface List { id: string, name: string, standard: boolean, restricted: boolean, fallsBack: boolean, percentOff: number | null, active: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ lists: List[] }>('/api/bar/price-lists', { key: 'bar:price-lists' })

function describe(l: List): string {
  const how = l.standard
    ? t('bar.screens.lists.standard')
    : l.percentOff !== null ? t('bar.screens.lists.percent', { percent: l.percentOff }) : l.fallsBack ? t('bar.screens.lists.by-hand-falls-back') : t('bar.screens.lists.by-hand')
  return [how, l.restricted ? t('bar.screens.lists.restricted') : null].filter(Boolean).join(' · ')
}

const form = ref<{ id: string | null, standard: boolean, name: string, restricted: boolean, fallsBack: boolean, pricing: 'hand' | 'percent', percentOff: number | null } | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const pricingItems = computed(() => [{ value: 'hand', label: t('bar.screens.lists.pricing-hand') }, { value: 'percent', label: t('bar.screens.lists.pricing-percent') }])
function edit(l?: List) {
  refusal.value = null
  form.value = l
    ? { id: l.id, standard: l.standard, name: l.name, restricted: l.restricted, fallsBack: l.fallsBack, pricing: l.percentOff === null ? 'hand' : 'percent', percentOff: l.percentOff }
    : { id: null, standard: false, name: '', restricted: false, fallsBack: true, pricing: 'hand', percentOff: null }
}
async function save() {
  const f = form.value!
  refusal.value = null
  const body = f.standard
    ? { name: f.name, restricted: f.restricted }
    : { name: f.name, restricted: f.restricted, fallsBack: f.fallsBack, percentOff: f.pricing === 'percent' ? f.percentOff : null }
  try {
    if (f.id) await $api(`/api/bar/price-lists/${f.id}` as string, { method: 'PATCH', body })
    else await $api('/api/bar/price-lists', { method: 'POST', body })
    toast.add({ title: t('bar.screens.lists.saved'), color: 'success' })
    form.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function setActive(l: List, active: boolean) {
  try {
    await $api(`/api/bar/price-lists/${l.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.price-lists.label')">
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('bar.screens.lists.new')"
        @click="edit()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <RecordList
        v-if="data"
        :label="t('bar.navigation.price-lists.label')"
      >
        <RecordListItem
          v-for="l in data.lists"
          :key="l.id"
          :description="describe(l)"
          :muted="!l.active"
        >
          <template #name>
            <ULink :to="`/console/bar/price-lists/${l.id}`">
              {{ l.active ? l.name : t('bar.screens.products.retired-name', { name: l.name }) }}
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
          :state="form"
          class="space-y-4"
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
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
