<!-- Bulk cancellation (Box office specification, part 6; BO-52, BO-53): reached from the link in the
     core's refusal to cancel, reschedule or move a performance with bookings. It shows the tickets
     and money affected and records what happens to them when the change goes through: refund
     everyone, tell everyone and offer an exchange, or keep the bookings (not for a cancellation).
     Unpaid reservations are cancelled with the performance whatever is chosen. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

type Decision = 'refund_all' | 'offer_exchange' | 'keep'
interface Change {
  performance: { id: string, title: string, startsAt: number, state: string, venue: string }
  bookings: number
  tickets: number
  paidMinor: number
  reservations: number
  reservedTickets: number
  complimentary: number
  complimentaryBookings: number
  currency: string | null
  decision: Decision | null
  decidedAt: number | null
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const { money } = await useMoney()
const toast = useToast()
const route = useRoute()
const id = computed(() => String(route.params.id))
const forKind = computed(() => (['cancel', 'reschedule', 'move'] as const).find(k => k === route.query.for) ?? null)

const { data, status, error, refresh } = await useAPI<Change>(() => `/api/box-office/performances/${encodeURIComponent(id.value)}/change`, { key: `box-office:change:${id.value}` })

const choice = ref<Decision | undefined>(undefined)
watch(data, (d) => {
  if (d && !choice.value) choice.value = d.decision ?? undefined
}, { immediate: true })
const choices = computed(() => (['refund_all', 'offer_exchange', 'keep'] as const)
  .filter(d => !(d === 'keep' && forKind.value === 'cancel'))
  .map(d => ({ value: d, label: t(`box-office.change.decision.${d}.label`), description: t(`box-office.change.decision.${d}.description`) })))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const saving = ref(false)

async function save() {
  if (!choice.value) return
  refusal.value = null
  saving.value = true
  try {
    await $api(`/api/box-office/performances/${encodeURIComponent(id.value)}/change`, { method: 'POST', body: { decision: choice.value } })
    toast.add({ title: t('box-office.change.saved'), description: t('box-office.change.saved-next'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}

const trail = computed(() => [
  { label: t('box-office.navigation.performances.label'), to: '/console/box-office/performances' },
  { label: t('box-office.door.set-up'), to: `/console/box-office/performances/${encodeURIComponent(id.value)}` },
])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame
        :title="t('box-office.change.title', { title: d.performance.title, when: dateTime(d.performance.startsAt) })"
        :description="t(forKind ? `box-office.change.description.${forKind}` : 'box-office.change.description.any')"
        :trail="trail"
      >
        <div class="space-y-8">
          <PageSection :title="t('box-office.change.affected')">
            <EmptyState
              v-if="!d.bookings && !d.reservations && !d.complimentaryBookings"
              :title="t('box-office.change.none.title')"
              :description="t('box-office.change.none.description')"
              icon="i-lucide-ticket"
            />
            <dl
              v-else
              class="grid gap-4 sm:grid-cols-3"
              :class="d.complimentary ? 'lg:grid-cols-4' : undefined"
            >
              <div>
                <dt class="text-sm text-muted">
                  {{ t('box-office.change.paid-tickets') }}
                </dt>
                <dd class="text-2xl font-semibold">
                  {{ t('box-office.change.tickets', { count: d.tickets }) }}
                </dd>
                <dd class="text-sm text-muted">
                  {{ t('box-office.change.bookings', { count: d.bookings }) }}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('box-office.change.paid') }}
                </dt>
                <dd class="text-2xl font-semibold">
                  {{ money(d.paidMinor, d.currency ?? undefined) }}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  {{ t('box-office.change.reserved') }}
                </dt>
                <dd class="text-2xl font-semibold">
                  {{ t('box-office.change.tickets', { count: d.reservedTickets }) }}
                </dd>
                <dd class="text-sm text-muted">
                  {{ t('box-office.change.bookings', { count: d.reservations }) }}
                </dd>
              </div>
              <div v-if="d.complimentary">
                <dt class="text-sm text-muted">
                  {{ t('box-office.change.complimentary') }}
                </dt>
                <dd class="text-2xl font-semibold">
                  {{ t('box-office.change.tickets', { count: d.complimentary }) }}
                </dd>
                <dd class="text-sm text-muted">
                  {{ t('box-office.change.bookings', { count: d.complimentaryBookings }) }}
                </dd>
              </div>
            </dl>
          </PageSection>

          <PageSection
            v-if="d.bookings || d.reservations || d.complimentaryBookings"
            :title="t('box-office.change.decide')"
            :description="t('box-office.change.decide-help')"
          >
            <UForm
              class="space-y-4"
              :state="{ choice }"
              novalidate
              @submit="save"
            >
              <RefusalNotice :refusal="refusal" />
              <p
                v-if="d.decision"
                class="text-sm"
              >
                {{ t('box-office.change.current', { decision: t(`box-office.change.decision.${d.decision}.label`), when: dateTime(d.decidedAt!) }) }}
              </p>
              <UFormField :label="t('box-office.change.decision.label')">
                <URadioGroup
                  v-model="choice"
                  :items="choices"
                />
              </UFormField>
              <UButton
                type="submit"
                :label="t('box-office.change.save')"
                :loading="saving"
                :disabled="!choice"
              />
            </UForm>
          </PageSection>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
