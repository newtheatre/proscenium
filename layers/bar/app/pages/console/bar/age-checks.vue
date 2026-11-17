<!-- The refusals register (S15): every age check and every refusal, newest first, filtered by day,
     outlet and outcome, with the managers' signatures above. Rows are read only, except that someone
     who signs the register may erase a description of a person refused. -->
<script setup lang="ts">
type Outcome = 'not_needed' | 'id_checked' | 'self_attested' | 'refused'
interface Row { id: string, at: number, outlet: string, outcome: Outcome, reason: string | null, product: string | null, by: string, sale: string | null, description: string | null }
interface Review { id: string, outlet: string | null, fromDay: string, toDay: string, refusals: number, by: string, at: number }
interface Register { rows: Row[], reviews: Review[], outlets: { id: string, name: string }[], canReview: boolean, describing: boolean }

const { t } = useT()
const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const { dateTime, range: dayRange } = useDates()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()

// Filters live in the address.
const ALL = 'all'
const range = computed({
  get: () => ({ start: (route.query.from as string | undefined) ?? '', end: (route.query.to as string | undefined) ?? '' }),
  set: (v: { start: string, end: string }) => {
    if (v.start && v.end) void router.replace({ query: { ...route.query, from: v.start, to: v.end } })
  },
})
const outlet = computed({
  get: () => (route.query.outlet as string | undefined) ?? ALL,
  set: (v: string) => void router.replace({ query: { ...route.query, outlet: v === ALL ? undefined : v } }),
})
const outcome = computed({
  get: () => (route.query.outcome as string | undefined) ?? ALL,
  set: (v: string) => void router.replace({ query: { ...route.query, outcome: v === ALL ? undefined : v } }),
})
const query = computed(() => ({
  from: range.value.start || undefined,
  to: range.value.end || undefined,
  outlet: outlet.value === ALL ? undefined : outlet.value,
  outcome: outcome.value === ALL ? undefined : outcome.value,
}))
const { data, status, error, refresh } = await useAPI<Register>('/api/bar/age-checks', { key: 'bar:age-checks', query })

const outcomes: Outcome[] = ['refused', 'id_checked', 'not_needed', 'self_attested']
const outcomeLabel = (o: Outcome) => t(`bar.screens.age-checks.outcome.${o}`)
const outletItems = computed(() => [{ value: ALL, label: t('bar.screens.age-checks.every-outlet') }, ...(data.value?.outlets ?? []).map(o => ({ value: o.id, label: o.name }))])
const outcomeItems = computed(() => [{ value: ALL, label: t('bar.screens.age-checks.every-outcome') }, ...outcomes.map(o => ({ value: o, label: outcomeLabel(o) }))])
const describing = computed(() => !!data.value && (data.value.describing || data.value.rows.some(r => r.description)))
const columns = computed(() => [
  { id: 'at', header: t('bar.screens.age-checks.when') },
  { accessorKey: 'outlet', header: t('bar.screens.age-checks.outlet') },
  { id: 'outcome', header: t('bar.screens.age-checks.outcome-heading') },
  { id: 'reason', header: t('bar.screens.age-checks.reason') },
  { id: 'product', header: t('bar.screens.age-checks.product') },
  { accessorKey: 'by', header: t('bar.screens.age-checks.by') },
  { id: 'sale', header: t('bar.screens.age-checks.sale') },
  ...(describing.value ? [{ id: 'description', header: t('bar.screens.age-checks.description') }] : []),
])

async function erase(row: Row) {
  const ok = await confirm({
    verb: t('bar.screens.age-checks.erase'),
    thing: t('bar.screens.age-checks.erase-thing'),
    consequence: t('bar.screens.age-checks.erase-consequence'),
    button: t('bar.screens.age-checks.erase'),
  })
  if (!ok) return
  try {
    await $api(`/api/bar/age-checks/${row.id}/erase-description` as string, { method: 'POST', body: {} })
    toast.add({ title: t('bar.screens.age-checks.erased'), color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}

// Signing: choose the days (and an outlet, or every outlet), see how many refusals they cover, confirm.
const signing = ref<{ days: { start: string, end: string }, outlet: string } | null>(null)
const covered = ref<number | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function startSigning() {
  signing.value = { days: { start: '', end: '' }, outlet: ALL }
  covered.value = null
  refusal.value = null
}
const signBody = computed(() => signing.value && signing.value.days.start && signing.value.days.end
  ? { fromDay: signing.value.days.start, toDay: signing.value.days.end, outletId: signing.value.outlet === ALL ? null : signing.value.outlet }
  : null)
watch(signBody, async (body) => {
  covered.value = null
  if (!body) return
  try {
    covered.value = (await $api<{ refusals: number }>('/api/bar/age-checks/review', { query: { fromDay: body.fromDay, toDay: body.toDay, ...(body.outletId ? { outletId: body.outletId } : {}) } })).refusals
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
})
async function sign() {
  if (!signBody.value) return
  refusal.value = null
  try {
    await $api('/api/bar/age-checks/review', { method: 'POST', body: signBody.value })
    signing.value = null
    toast.add({ title: t('bar.screens.age-checks.signed'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const days = (r: Review) => dayRange(r.fromDay, r.toDay)
</script>

<template>
  <PageFrame
    :title="t('bar.navigation.age-checks.label')"
    :description="t('bar.screens.age-checks.description-page')"
  >
    <template #primary>
      <UButton
        v-if="data?.canReview"
        icon="i-lucide-signature"
        :label="t('bar.screens.age-checks.sign')"
        @click="startSigning()"
      />
    </template>
    <div class="mb-6 grid gap-4 sm:grid-cols-3">
      <UFormField :label="t('bar.screens.age-checks.days-filter')">
        <FieldDateRange v-model="range" />
      </UFormField>
      <UFormField :label="t('bar.screens.age-checks.outlet')">
        <USelect
          v-model="outlet"
          :items="outletItems"
        />
      </UFormField>
      <UFormField :label="t('bar.screens.age-checks.outcome-heading')">
        <USelect
          v-model="outcome"
          :items="outcomeItems"
        />
      </UFormField>
    </div>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-6">
          <PageSection
            v-if="d.reviews.length"
            :title="t('bar.screens.age-checks.signatures')"
          >
            <RecordList :label="t('bar.screens.age-checks.signatures')">
              <RecordListItem
                v-for="r in d.reviews"
                :key="r.id"
                :name="days(r)"
                :description="t('bar.screens.age-checks.signed-by', { name: r.by, when: dateTime(r.at), count: r.refusals, outlet: r.outlet ?? t('bar.screens.age-checks.every-outlet') })"
              />
            </RecordList>
          </PageSection>
          <EmptyState
            v-if="!d.rows.length"
            :title="t('bar.screens.age-checks.empty.title')"
            :description="t('bar.screens.age-checks.empty.description')"
            icon="i-lucide-id-card"
          />
          <UTable
            v-else
            :data="d.rows"
            :columns="columns"
            :caption="t('bar.navigation.age-checks.label')"
          >
            <template #at-cell="{ row }">
              {{ dateTime(row.original.at) }}
            </template>
            <template #outcome-cell="{ row }">
              <StatusBadge
                :tone="row.original.outcome === 'refused' ? 'warning' : 'neutral'"
                :label="outcomeLabel(row.original.outcome)"
              />
            </template>
            <template #reason-cell="{ row }">
              {{ row.original.reason ?? '' }}
            </template>
            <template #product-cell="{ row }">
              {{ row.original.product ?? '' }}
            </template>
            <template #sale-cell="{ row }">
              {{ row.original.sale ?? t('bar.screens.age-checks.no-sale') }}
            </template>
            <template #description-cell="{ row }">
              <div
                v-if="row.original.description"
                class="flex items-center gap-2"
              >
                <span>{{ row.original.description }}</span>
                <IconButton
                  v-if="d.canReview"
                  icon="i-lucide-eraser"
                  :label="t('bar.screens.age-checks.erase')"
                  @click="erase(row.original)"
                />
              </div>
            </template>
          </UTable>
        </div>
      </template>
    </DataBoundary>

    <UModal
      :open="!!signing"
      :title="t('bar.screens.age-checks.sign')"
      :description="t('bar.screens.age-checks.sign-help')"
      @update:open="v => { if (!v) signing = null }"
    >
      <template #body>
        <UForm
          v-if="signing"
          id="bar-sign"
          :state="signing"
          class="space-y-4"
          @submit="sign"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.age-checks.days-filter')"
            name="days"
            required
          >
            <FieldDateRange v-model="signing.days" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.age-checks.outlet')"
            name="outlet"
          >
            <USelect
              v-model="signing.outlet"
              :items="outletItems"
            />
          </UFormField>
          <p
            v-if="covered !== null"
            class="text-sm"
          >
            {{ t('bar.screens.age-checks.covers', { count: covered }) }}
          </p>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-sign"
          :disabled="!signBody"
          :label="t('bar.screens.age-checks.sign-confirm')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
