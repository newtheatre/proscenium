<!-- Complimentary tickets (Box office specification, part 6; BO-62, BO-63): ask for tickets for
     someone, see what has been decided, and, for an approver, decide the requests waiting.
     Approving issues the tickets at once and sends them to the person named. Nobody sees their own
     request among those waiting. -->
<script setup lang="ts">
import { compsInput } from '../../../../server/input'

definePageMeta({ layout: 'console' })

type State = 'requested' | 'approved' | 'declined' | 'issued' | 'withdrawn'
interface Request { id: string, state: State, quantity: number, show: string, startsAt: number, band: string, forName: string | null, reason: string, requestedBy: string | null, orderId: string | null, reservation: string | null }
interface Offer { id: string, title: string, label: string | null, startsAt: number, bands: { id: string, name: string }[] }
interface Comps { mine: Request[], waiting: Request[], decided: Request[], performances: Offer[], needsApproval: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const askForm = useTemplateRef('askForm')
const { dateTime } = useDates()
const { confirm } = useConfirm()
const toast = useToast()
const { offer } = useUndo()

const { data, status, error, refresh } = await useAPI<Comps>('/api/box-office/comps', { key: 'box-office:comps' })
const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/box-office.comp-reason/terms', { key: 'box-office:comp-reasons', default: () => ({ terms: [] }) })

const TONES = { requested: 'info', approved: 'info', issued: 'success', declined: 'danger', withdrawn: 'neutral' } as const

// A select item cannot have an empty value, so Any seats has a word of its own.
const ANY = 'any'
const blank = () => ({ performanceId: '', bandId: ANY, quantity: 1, name: '', email: '', reasonTermId: '' })
const form = ref(blank())
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const asking = ref(false)
// With box-office.comps.needs-approval off, asking issues the tickets at once.
const direct = computed(() => data.value?.needsApproval === false)
const askWords = (key: string) => t(`box-office.comps.ask.${key}${direct.value ? '-direct' : ''}`)
function startAsking() {
  form.value = blank()
  refusal.value = null
  asking.value = true
}
const busy = ref<string | null>(null)

const performanceItems = computed(() => (data.value?.performances ?? []).map(p => ({ value: p.id, label: `${p.title}, ${dateTime(p.startsAt)}` })))
// Seats are optional: left at Any, the band with most room is taken, and the approver sees which.
const bandItems = computed(() => [
  { value: ANY, label: t('box-office.comps.ask.any-band') },
  ...(data.value?.performances.find(p => p.id === form.value.performanceId)?.bands ?? []).map(b => ({ value: b.id, label: b.name })),
])
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))
watch(() => form.value.performanceId, () => {
  form.value.bandId = ANY
})

const describe = (r: Request) => [`${r.show}, ${dateTime(r.startsAt)}`, r.reservation ? t('box-office.comps.reservation', { reference: r.reservation }) : r.band, t('box-office.comps.for', { name: r.forName ?? t('box-office.orders.no-buyer') }), r.reason].join(', ')
const nameOf = (r: Request) => t('box-office.comps.tickets', { count: r.quantity })
// Requests withdrawn or declined fold away under a divider below the others.
const closed = (r: Request) => r.state === 'withdrawn' || r.state === 'declined'
const open = computed(() => (data.value?.mine ?? []).filter(r => !closed(r)))
const finished = computed(() => (data.value?.mine ?? []).filter(closed))
const showFinished = ref(false)
const showDecided = ref(false)

async function ask() {
  refusal.value = null
  try {
    const { requestId, issued } = await $api<{ requestId: string, issued: boolean }>('/api/box-office/comps', { method: 'POST', body: { ...form.value, bandId: form.value.bandId === ANY ? undefined : form.value.bandId || undefined, name: form.value.name.trim() || undefined, email: form.value.email.trim() } })
    asking.value = false
    form.value = blank()
    await refresh()
    // Tickets issued at once have been sent: there is nothing to undo.
    if (issued) {
      toast.add({ title: t('box-office.comps.issued'), color: 'success' })
      return
    }
    // Undo withdraws the request, while nobody has decided it yet.
    offer(t('box-office.comps.asked'), async () => {
      await $api(`/api/box-office/comps/${encodeURIComponent(requestId)}/withdraw`, { method: 'POST', body: {} })
      await refresh()
    })
  }
  catch (e) {
    refusal.value = toRefusal(e)
    askForm.value?.setErrors(fieldErrors(refusal.value))
  }
}

async function act(r: Request, verb: 'approve' | 'decline' | 'withdraw') {
  if (verb !== 'approve' && !await confirm({ verb: t(`box-office.comps.${verb}.verb`), thing: nameOf(r), consequence: t(`box-office.comps.${verb}.consequence`), button: t(`box-office.comps.${verb}.button`) })) return
  busy.value = r.id
  try {
    await $api(`/api/box-office/comps/${encodeURIComponent(r.id)}/${verb}`, { method: 'POST', body: {} })
    // Say who was sent what, so the approver knows exactly what they did.
    const who = r.forName ?? t('box-office.orders.no-buyer')
    toast.add({ title: t(`box-office.comps.${verb}.done`, { count: r.quantity, name: who }), color: 'success' })
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
    :description="direct ? t('box-office.comps.description-direct') : t('box-office.comps.description')"
  >
    <template
      v-if="data?.performances.length"
      #primary
    >
      <UButton
        icon="i-lucide-gift"
        :label="askWords('title')"
        @click="startAsking"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-8">
          <PageSection
            v-if="d.waiting.length || d.decided.length"
            :title="t('box-office.comps.waiting')"
          >
            <p
              v-if="!d.waiting.length"
              class="text-sm text-muted"
            >
              {{ t('box-office.comps.nothing-waiting') }}
            </p>
            <RecordList
              v-else
              :label="t('box-office.comps.waiting')"
            >
              <RecordListItem
                v-for="r in d.waiting"
                :key="r.id"
                icon="i-lucide-gift"
                :name="nameOf(r)"
                :description="`${describe(r)}, ${t('box-office.comps.asked-by', { name: r.requestedBy ?? '' })}`"
              >
                <span class="inline-flex flex-wrap gap-2">
                  <UButton
                    size="sm"
                    loading-auto
                    :disabled="busy === r.id"
                    :label="t('box-office.comps.approve.button')"
                    @click="act(r, 'approve')"
                  />
                  <UButton
                    size="sm"
                    variant="outline"
                    color="neutral"
                    loading-auto
                    :disabled="busy === r.id"
                    :label="t('box-office.comps.decline.button')"
                    @click="act(r, 'decline')"
                  />
                </span>
              </RecordListItem>
            </RecordList>
            <CollapsibleDivider
              v-if="d.decided.length"
              v-model:open="showDecided"
              :class="d.waiting.length ? 'mt-4' : undefined"
              :label="t('box-office.comps.decided')"
              :count="d.decided.length"
            >
              <RecordList :label="t('box-office.comps.decided')">
                <RecordListItem
                  v-for="r in d.decided"
                  :key="r.id"
                  icon="i-lucide-gift"
                  :to="r.orderId ? `/console/box-office/orders/${encodeURIComponent(r.orderId)}` : undefined"
                  :name="nameOf(r)"
                  :description="`${describe(r)}, ${t('box-office.comps.asked-by', { name: r.requestedBy ?? '' })}`"
                >
                  <StatusBadge
                    :tone="TONES[r.state]"
                    :label="t(`box-office.comps.state.${r.state}`)"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </PageSection>

          <EmptyState
            v-if="!d.mine.length"
            :title="t('box-office.comps.empty.title')"
            :description="askWords('empty-description')"
            icon="i-lucide-gift"
          />
          <PageSection
            v-else
            :title="t('box-office.comps.mine')"
          >
            <template v-if="d.mine.length">
              <RecordList
                v-if="open.length"
                :label="t('box-office.comps.mine')"
              >
                <RecordListItem
                  v-for="r in open"
                  :key="r.id"
                  icon="i-lucide-gift"
                  :name="nameOf(r)"
                  :description="describe(r)"
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
                      loading-auto
                      :label="t('box-office.comps.withdraw.button')"
                      @click="act(r, 'withdraw')"
                    />
                  </span>
                </RecordListItem>
              </RecordList>
              <CollapsibleDivider
                v-model:open="showFinished"
                :class="open.length ? 'mt-4' : undefined"
                :label="t('box-office.comps.closed')"
                :count="finished.length"
              >
                <RecordList :label="t('box-office.comps.closed')">
                  <RecordListItem
                    v-for="r in finished"
                    :key="r.id"
                    icon="i-lucide-gift"
                    :name="nameOf(r)"
                    :description="describe(r)"
                    muted
                  >
                    <StatusBadge
                      :tone="TONES[r.state]"
                      :label="t(`box-office.comps.state.${r.state}`)"
                    />
                  </RecordListItem>
                </RecordList>
              </CollapsibleDivider>
            </template>
          </PageSection>
        </div>
      </template>
    </DataBoundary>
    <UModal
      v-model:open="asking"
      :title="askWords('title')"
      :description="askWords('description')"
    >
      <template #body>
        <UForm
          id="comps-ask-form"
          ref="askForm"
          class="space-y-4"
          :schema="compsInput"
          :state="form"
          novalidate
          @submit="ask"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="performanceId"
            :label="t('box-office.comps.ask.performance')"
            required
          >
            <USelectMenu
              v-model="form.performanceId"
              value-key="value"
              :items="performanceItems"
            />
          </UFormField>
          <UFormField
            name="bandId"
            :label="t('box-office.comps.ask.band')"
            :help="t('box-office.comps.ask.band-help')"
          >
            <USelect
              v-model="form.bandId"
              :items="bandItems"
              :disabled="!form.performanceId"
            />
          </UFormField>
          <UFormField
            name="quantity"
            :label="t('box-office.comps.ask.quantity')"
            required
          >
            <FieldNumber
              v-model="form.quantity"
              :min="1"
            />
          </UFormField>
          <UFormField
            name="name"
            :label="t('box-office.comps.ask.name')"
          >
            <UInput
              v-model="form.name"
              maxlength="120"
              autocomplete="off"
            />
          </UFormField>
          <UFormField
            name="email"
            :label="t('box-office.comps.ask.email')"
            :help="askWords('email-help')"
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
            name="reasonTermId"
            :label="t('box-office.comps.ask.reason')"
            required
          >
            <USelect
              v-model="form.reasonTermId"
              :items="reasonItems"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="comps-ask-form"
          :label="askWords('button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
