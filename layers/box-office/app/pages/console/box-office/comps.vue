<!-- Complimentary tickets (Box office specification, part 6; BO-62, BO-63): ask for tickets for
     someone, see what has been decided, and, for an approver, decide the requests waiting.
     Approving issues the tickets at once and sends them to the person named. Nobody sees their own
     request among those waiting. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

type State = 'requested' | 'approved' | 'declined' | 'issued' | 'withdrawn'
interface Request { id: string, state: State, quantity: number, show: string, startsAt: number, band: string, forName: string | null, reason: string, requestedBy: string | null, orderId: string | null }
interface Offer { id: string, title: string, label: string | null, startsAt: number, bands: { id: string, name: string }[] }
interface Comps { mine: Request[], waiting: Request[], performances: Offer[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const { confirm } = useConfirm()
const toast = useToast()

const { data, status, error, refresh } = await useAPI<Comps>('/api/box-office/comps', { key: 'box-office:comps' })
const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/box-office.comp-reason/terms', { key: 'box-office:comp-reasons', default: () => ({ terms: [] }) })

const TONES = { requested: 'info', approved: 'info', issued: 'success', declined: 'danger', withdrawn: 'neutral' } as const

const blank = () => ({ performanceId: '', bandId: '', quantity: 1, name: '', email: '', reasonTermId: '' })
const form = ref(blank())
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref<string | null>(null)

const performanceItems = computed(() => (data.value?.performances ?? []).map(p => ({ value: p.id, label: `${p.title}, ${dateTime(p.startsAt)}` })))
const bandItems = computed(() => (data.value?.performances.find(p => p.id === form.value.performanceId)?.bands ?? []).map(b => ({ value: b.id, label: b.name })))
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))
watch(() => form.value.performanceId, () => {
  form.value.bandId = bandItems.value.length === 1 ? bandItems.value[0]!.value : ''
})
const ready = computed(() => !!(form.value.performanceId && form.value.bandId && form.value.reasonTermId && form.value.email.trim() && form.value.quantity > 0))

const describe = (r: Request) => [`${r.show}, ${dateTime(r.startsAt)}`, r.band, t('box-office.comps.for', { name: r.forName ?? t('box-office.orders.no-buyer') }), r.reason].join(' · ')
const nameOf = (r: Request) => t('box-office.comps.tickets', { count: r.quantity })

async function ask() {
  refusal.value = null
  try {
    await $api('/api/box-office/comps', { method: 'POST', body: { ...form.value, name: form.value.name.trim() || undefined, email: form.value.email.trim() } })
    toast.add({ title: t('box-office.comps.asked'), color: 'success' })
    form.value = blank()
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function act(r: Request, verb: 'approve' | 'decline' | 'withdraw') {
  if (verb !== 'approve' && !await confirm({ verb: t(`box-office.comps.${verb}.verb`), thing: nameOf(r), consequence: t(`box-office.comps.${verb}.consequence`), button: t(`box-office.comps.${verb}.button`) })) return
  busy.value = r.id
  try {
    await $api(`/api/box-office/comps/${encodeURIComponent(r.id)}/${verb}`, { method: 'POST', body: {} })
    toast.add({ title: t(`box-office.comps.${verb}.done`), color: 'success' })
    await refresh()
  }
  catch (e) {
    const refused = toRefusal(e)
    toast.add({ title: refused.reason, description: refused.remedy, color: 'error' })
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.comps.label')"
    :description="t('box-office.comps.description')"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-8">
          <PageSection
            v-if="d.waiting.length"
            :title="t('box-office.comps.waiting')"
          >
            <RecordList :label="t('box-office.comps.waiting')">
              <RecordListItem
                v-for="r in d.waiting"
                :key="r.id"
                icon="i-lucide-gift"
                :name="nameOf(r)"
                :description="`${describe(r)} · ${t('box-office.comps.asked-by', { name: r.requestedBy ?? '' })}`"
              >
                <span class="inline-flex flex-wrap gap-2">
                  <UButton
                    size="sm"
                    :loading="busy === r.id"
                    :label="t('box-office.comps.approve.button')"
                    @click="act(r, 'approve')"
                  />
                  <UButton
                    size="sm"
                    variant="outline"
                    color="neutral"
                    :loading="busy === r.id"
                    :label="t('box-office.comps.decline.button')"
                    @click="act(r, 'decline')"
                  />
                </span>
              </RecordListItem>
            </RecordList>
          </PageSection>

          <PageSection
            v-if="d.performances.length"
            :title="t('box-office.comps.ask.title')"
            :description="t('box-office.comps.ask.description')"
          >
            <UForm
              class="space-y-4"
              :state="form"
              @submit="ask"
            >
              <RefusalNotice :refusal="refusal" />
              <UFormField
                :label="t('box-office.comps.ask.performance')"
                required
              >
                <USelect
                  v-model="form.performanceId"
                  :items="performanceItems"
                />
              </UFormField>
              <UFormField
                :label="t('box-office.comps.ask.band')"
                required
              >
                <USelect
                  v-model="form.bandId"
                  :items="bandItems"
                  :disabled="!form.performanceId"
                />
              </UFormField>
              <UFormField
                :label="t('box-office.comps.ask.quantity')"
                required
              >
                <UInputNumber
                  v-model="form.quantity"
                  :min="1"
                />
              </UFormField>
              <UFormField :label="t('box-office.comps.ask.name')">
                <UInput
                  v-model="form.name"
                  maxlength="120"
                  autocomplete="off"
                />
              </UFormField>
              <UFormField
                :label="t('box-office.comps.ask.email')"
                :help="t('box-office.comps.ask.email-help')"
                required
              >
                <UInput
                  v-model="form.email"
                  type="email"
                  maxlength="254"
                  autocomplete="off"
                />
              </UFormField>
              <UFormField
                :label="t('box-office.comps.ask.reason')"
                required
              >
                <USelect
                  v-model="form.reasonTermId"
                  :items="reasonItems"
                />
              </UFormField>
              <UButton
                type="submit"
                :label="t('box-office.comps.ask.button')"
                :disabled="!ready"
              />
            </UForm>
          </PageSection>

          <PageSection :title="t('box-office.comps.mine')">
            <EmptyState
              v-if="!d.mine.length"
              :title="t('box-office.comps.empty.title')"
              :description="t('box-office.comps.empty.description')"
              icon="i-lucide-gift"
            />
            <RecordList
              v-else
              :label="t('box-office.comps.mine')"
            >
              <RecordListItem
                v-for="r in d.mine"
                :key="r.id"
                icon="i-lucide-gift"
                :name="nameOf(r)"
                :description="describe(r)"
                :muted="r.state === 'withdrawn' || r.state === 'declined'"
              >
                <span class="inline-flex flex-wrap items-center gap-2">
                  <StatusBadge
                    :tone="TONES[r.state]"
                    :label="t(`box-office.comps.state.${r.state}`)"
                  />
                  <UButton
                    v-if="r.state === 'requested'"
                    size="sm"
                    variant="outline"
                    color="neutral"
                    :loading="busy === r.id"
                    :label="t('box-office.comps.withdraw.button')"
                    @click="act(r, 'withdraw')"
                  />
                </span>
              </RecordListItem>
            </RecordList>
          </PageSection>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
