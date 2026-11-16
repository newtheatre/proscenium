<!-- One period (Box office specification, part 5): its totals, the close checklist (each thing that
     stops it closing, linked to where it is fixed) and Close. A closed period is reopened with a
     reason from the theatre's list. -->
<script setup lang="ts">
interface Period { id: string, label: string, startsOn: string, endsOn: string, closed: boolean, debitsMinor: number, creditsMinor: number }
interface Blocker { sentence: string, to?: string, module: string }

const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const { money } = await useMoney()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ period: Period, blockers: Blocker[], canClose: boolean, canReopen: boolean }>(() => `/api/finance/periods/${id.value}`, { key: `finance:period:${id.value}` })
const dateOf = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
async function close() {
  const p = data.value?.period
  if (!p) return
  const ok = await confirm({ verb: t('finance.screens.period.close-verb'), thing: p.label, consequence: t('finance.screens.period.close-consequence'), button: t('finance.screens.period.close-button') })
  if (!ok) return
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/finance/periods/${p.id}/close` as string, { method: 'POST', body: {} })
    toast.add({ title: t('finance.screens.period.closed', { period: p.label }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    await refresh()
  }
  finally {
    busy.value = false
  }
}

const reopening = ref(false)
const reason = ref<string | undefined>(undefined)
const { data: reasons, execute: loadReasons } = useAPI<{ reasons: { id: string, label: string }[] }>('/api/finance/periods/reopen-reasons', { key: 'finance:reopen-reasons', immediate: false, default: () => ({ reasons: [] }) })
async function openReopen() {
  reason.value = undefined
  refusal.value = null
  reopening.value = true
  await loadReasons()
}
async function reopen() {
  const p = data.value?.period
  if (!p || !reason.value) return
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/finance/periods/${p.id}/reopen` as string, { method: 'POST', body: { reasonTermId: reason.value } })
    reopening.value = false
    toast.add({ title: t('finance.screens.period.reopened', { period: p.label }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <PageFrame
    :title="data?.period.label ?? t('finance.navigation.periods.label')"
    width="reading"
  >
    <template
      v-if="data"
      #status
    >
      <StatusBadge
        :tone="data.period.closed ? 'neutral' : 'success'"
        :label="t(data.period.closed ? 'finance.screens.periods.closed' : 'finance.screens.periods.open')"
      />
    </template>
    <template
      v-if="data"
      #primary
    >
      <UButton
        v-if="!data.period.closed && data.canClose"
        :label="t('finance.screens.period.close-button')"
        icon="i-lucide-lock"
        :disabled="data.blockers.length > 0"
        :loading="busy"
        @click="close"
      />
      <UButton
        v-else-if="data.period.closed && data.canReopen"
        :label="t('finance.screens.period.reopen-button')"
        icon="i-lucide-lock-open"
        color="neutral"
        variant="outline"
        @click="openReopen"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <div class="space-y-6">
          <RefusalNotice
            v-if="!reopening"
            :refusal="refusal"
          />
          <dl class="grid gap-4 sm:grid-cols-3">
            <div>
              <dt class="text-sm text-muted">
                {{ t('finance.screens.period.dates') }}
              </dt>
              <dd>{{ t('finance.screens.periods.range', { from: dateOf(loaded.period.startsOn), to: dateOf(loaded.period.endsOn) }) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                {{ t('finance.screens.period.debits') }}
              </dt>
              <dd class="tabular-nums">
                {{ money(loaded.period.debitsMinor) }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                {{ t('finance.screens.period.credits') }}
              </dt>
              <dd class="tabular-nums">
                {{ money(loaded.period.creditsMinor) }}
              </dd>
            </div>
          </dl>
          <UButton
            :to="{ path: '/console/finance/ledger', query: { periodId: loaded.period.id } }"
            :label="t('finance.screens.period.postings')"
            icon="i-lucide-book-open"
            color="neutral"
            variant="link"
            class="px-0"
          />

          <PageSection
            v-if="!loaded.period.closed"
            :title="t('finance.screens.period.checklist')"
            :description="t('finance.screens.period.checklist-help')"
          >
            <p
              v-if="!loaded.blockers.length"
              class="flex items-center gap-2"
            >
              <UIcon
                name="i-lucide-circle-check"
                class="text-success"
              />
              {{ t('finance.screens.period.ready') }}
            </p>
            <ul
              v-else
              class="space-y-2"
            >
              <li
                v-for="(b, i) in loaded.blockers"
                :key="i"
                class="flex items-start gap-2"
              >
                <UIcon
                  name="i-lucide-circle-alert"
                  class="mt-0.5 shrink-0 text-warning"
                />
                <NuxtLink
                  v-if="b.to"
                  :to="b.to"
                  class="underline"
                >{{ b.sentence }}</NuxtLink>
                <span v-else>{{ b.sentence }}</span>
              </li>
            </ul>
          </PageSection>
        </div>
      </template>
    </DataBoundary>

    <UModal
      v-model:open="reopening"
      :title="t('finance.screens.period.reopen-title', { period: data?.period.label ?? '' })"
      :description="t('finance.screens.period.reopen-help')"
    >
      <template #body>
        <form
          id="reopen-period"
          class="space-y-4"
          @submit.prevent="reopen"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('finance.screens.period.reason')"
            required
          >
            <USelect
              v-model="reason"
              :items="reasons?.reasons.map(r => ({ value: r.id, label: r.label })) ?? []"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="reopen-period"
          :loading="busy"
          :disabled="!reason"
          :label="t('finance.screens.period.reopen-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
