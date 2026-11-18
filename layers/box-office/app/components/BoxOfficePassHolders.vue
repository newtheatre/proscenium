<!-- The people who hold a pass (BO-64; mock-up approved by Matt 2026-11-18), in a panel beside the
     passes list: each holder with what they have booked and whether the pass is paid for. A pass can
     be given by hand, moved to another person (as when a split sale put it on the wrong one),
     cancelled, or sent to its holder again. -->
<script setup lang="ts">
interface Price { id: string, name: string, amountMinor: number, requirementRefs: string[], active: boolean }
interface Holder { id: string, name: string, priceName: string, accountId: string | null, named: boolean, code: string | null, usesTotal: number | null, usesTaken: number, amountMinor: number, paidAt: number | null, state: 'active' | 'void', holder: string | null, entries: number, shows: number }
interface Entry { orderId: string, reference: string, show: string, startsAt: number, confirmed: boolean }

const props = defineProps<{ pass: { id: string, name: string, active: boolean, prices: Price[] } | null }>()
const emit = defineEmits<{ close: [], changed: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { money } = await useMoney()
const { dateTime } = useDates()
const { confirm } = useConfirm()
const toast = useToast()

const rows = ref<Holder[] | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const picked = ref<{ pass: Holder, entries: Entry[] } | null>(null)
const giving = ref(false)
const give = ref<{ passPriceId: string | undefined, accountId: string | undefined, settled: boolean }>({ passPriceId: undefined, accountId: undefined, settled: false })
const moving = ref(false)
const moveTo = ref<string | undefined>()
const busy = ref(false)
let keys = 0
const key = () => ({ 'idempotency-key': `pass-holders:${Date.now()}:${++keys}` })

async function load() {
  if (!props.pass) return
  refusal.value = null
  try {
    rows.value = (await $api<{ rows: Holder[] }>(`/api/box-office/pass-types/${props.pass.id}/passes`)).rows
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
watch(() => props.pass?.id, () => {
  rows.value = null
  picked.value = null
  giving.value = false
  void load()
}, { immediate: true })

async function show(id: string) {
  moving.value = false
  try {
    picked.value = await $api<{ pass: Holder, entries: Entry[] }>(`/api/box-office/passes/${id}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function act(body: Record<string, unknown>, done: string) {
  if (!picked.value) return
  refusal.value = null
  busy.value = true
  try {
    await $api(`/api/box-office/passes/${picked.value.pass.id}`, { method: 'POST', body, headers: key() })
    toast.add({ title: done, color: 'success' })
    await Promise.all([show(picked.value.pass.id), load()])
    emit('changed')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
async function cancel() {
  if (!picked.value) return
  const p = picked.value.pass
  if (await confirm({ verb: t('box-office.passes.holders.cancel'), thing: p.holder ?? p.code ?? p.name, consequence: t('box-office.passes.holders.cancel-consequence') }))
    await act({ action: 'cancel' }, t('box-office.passes.holders.cancelled'))
}
async function settle() {
  if (!picked.value) return
  const p = picked.value.pass
  if (await confirm({ verb: t('box-office.passes.holders.settle'), thing: p.holder ?? p.code ?? p.name, consequence: t('box-office.passes.holders.settle-consequence', { amount: money(p.amountMinor) }), tone: 'primary' }))
    await act({ action: 'settle' }, t('box-office.passes.holders.settled'))
}
async function move() {
  if (!moveTo.value) return
  await act({ action: 'move', accountId: moveTo.value }, t('box-office.passes.holders.moved'))
  moving.value = false
  moveTo.value = undefined
}

const prices = computed(() => (props.pass?.prices ?? []).filter(p => p.active).map(p => ({ value: p.id, label: `${p.name} · ${money(p.amountMinor)}` })))
function startGiving() {
  give.value = { passPriceId: prices.value[0]?.value, accountId: undefined, settled: false }
  giving.value = true
  refusal.value = null
}
async function submitGive() {
  if (!props.pass || !give.value.passPriceId) return
  refusal.value = null
  busy.value = true
  try {
    const made = await $api<{ id: string, code: string }>(`/api/box-office/pass-types/${props.pass.id}/passes`, { method: 'POST', body: { passPriceId: give.value.passPriceId, accountId: give.value.accountId ?? null, settled: give.value.settled }, headers: key() })
    toast.add({ title: t('box-office.passes.holders.given', { code: made.code }), color: 'success' })
    giving.value = false
    await load()
    emit('changed')
    await show(made.id)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
const describe = (h: Holder) => [
  h.priceName,
  money(h.amountMinor),
  t('box-office.passes.holders.entries', { count: h.entries }),
  h.usesTotal !== null ? t('box-office.passes.holders.left', { count: h.usesTotal - h.usesTaken }) : null,
].filter(Boolean).join(' · ')
</script>

<template>
  <USlideover
    :open="!!pass"
    :title="pass ? t('box-office.passes.holders.title', { name: pass.name }) : ''"
    :description="t('box-office.passes.holders.description')"
    @update:open="v => { if (!v) emit('close') }"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />

        <!-- One pass. -->
        <template v-if="picked">
          <UButton
            color="neutral"
            variant="link"
            icon="i-lucide-arrow-left"
            :label="t('box-office.passes.holders.back')"
            class="px-0"
            @click="picked = null"
          />
          <div>
            <h3 class="text-lg font-medium">
              {{ picked.pass.holder ?? t('box-office.passes.holders.nobody') }}
            </h3>
            <p class="text-sm text-muted">
              {{ [picked.pass.priceName, picked.pass.code].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <UAlert
            v-if="picked.pass.state === 'void'"
            color="neutral"
            variant="subtle"
            icon="i-lucide-ban"
            :title="t('box-office.passes.holders.is-cancelled')"
          />
          <UAlert
            v-else-if="!picked.pass.paidAt"
            color="warning"
            variant="subtle"
            icon="i-lucide-hand-coins"
            :title="t('box-office.passes.holders.not-paid', { amount: money(picked.pass.amountMinor) })"
            :description="t('box-office.passes.holders.not-paid-help')"
          />
          <section class="space-y-2">
            <h4 class="font-medium">
              {{ t('box-office.passes.holders.booked', { count: picked.entries.length }) }}
            </h4>
            <p
              v-if="!picked.entries.length"
              class="text-sm text-muted"
            >
              {{ t('box-office.passes.holders.none-booked') }}
            </p>
            <RecordList
              v-else
              :label="t('box-office.passes.holders.booked', { count: picked.entries.length })"
            >
              <RecordListItem
                v-for="e in picked.entries"
                :key="`${e.orderId}:${e.startsAt}`"
                :to="`/console/box-office/orders/${e.orderId}`"
                :name="e.show"
                :description="[dateTime(e.startsAt), e.reference, e.confirmed ? null : t('box-office.passes.holders.reserved')].filter(Boolean).join(' · ')"
              />
            </RecordList>
          </section>
          <UFormField
            v-if="moving"
            :label="t('box-office.passes.holders.move-to')"
            :help="t('box-office.passes.holders.move-help')"
            name="moveTo"
          >
            <div class="flex gap-2">
              <PersonPicker
                v-model="moveTo"
                :exclude="picked.pass.accountId ? [picked.pass.accountId] : []"
                class="min-w-0 flex-1"
              />
              <UButton
                :label="t('box-office.passes.holders.move')"
                :disabled="!moveTo"
                :loading="busy"
                @click="move"
              />
            </div>
          </UFormField>
          <div
            v-if="picked.pass.state === 'active'"
            class="flex flex-wrap gap-2"
          >
            <UButton
              v-if="!moving"
              color="neutral"
              variant="outline"
              icon="i-lucide-user-round-pen"
              :label="t('box-office.passes.holders.move')"
              @click="moving = true"
            />
            <UButton
              v-if="picked.pass.accountId"
              color="neutral"
              variant="outline"
              icon="i-lucide-send"
              :label="t('box-office.passes.holders.send')"
              :loading="busy"
              @click="act({ action: 'send' }, t('box-office.passes.holders.sent'))"
            />
            <UButton
              v-if="!picked.pass.paidAt"
              color="neutral"
              variant="outline"
              icon="i-lucide-check"
              :label="t('box-office.passes.holders.settle')"
              @click="settle"
            />
            <UButton
              color="error"
              variant="outline"
              icon="i-lucide-ban"
              :label="t('box-office.passes.holders.cancel')"
              @click="cancel"
            />
          </div>
          <UButton
            v-else
            color="neutral"
            variant="outline"
            icon="i-lucide-undo-2"
            :label="t('box-office.passes.holders.restore')"
            :loading="busy"
            @click="act({ action: 'restore' }, t('box-office.passes.holders.restored'))"
          />
        </template>

        <!-- Giving one by hand. -->
        <template v-else-if="giving">
          <UFormField
            :label="t('box-office.passes.holders.give-price')"
            name="passPriceId"
            required
          >
            <USelect
              v-model="give.passPriceId"
              :items="prices"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.passes.holders.give-who')"
            :help="t('box-office.passes.holders.give-who-help')"
            name="accountId"
          >
            <PersonPicker v-model="give.accountId" />
          </UFormField>
          <UCheckbox
            v-model="give.settled"
            :label="t('box-office.passes.holders.give-settled')"
            :description="t('box-office.passes.holders.give-settled-help')"
          />
          <div class="flex gap-2">
            <UButton
              :label="t('box-office.passes.holders.give')"
              :loading="busy"
              :disabled="!give.passPriceId"
              @click="submitGive"
            />
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('box-office.passes.holders.give-cancel')"
              @click="giving = false"
            />
          </div>
        </template>

        <!-- Everyone who holds one. -->
        <template v-else>
          <UButton
            v-if="pass?.active"
            color="neutral"
            variant="outline"
            icon="i-lucide-user-round-plus"
            :label="t('box-office.passes.holders.give')"
            @click="startGiving"
          />
          <p
            v-if="rows && !rows.length"
            class="text-sm text-muted"
          >
            {{ t('box-office.passes.holders.empty') }}
          </p>
          <RecordList
            v-else-if="rows"
            :label="t('box-office.passes.holders.title', { name: pass?.name ?? '' })"
          >
            <li
              v-for="h in rows"
              :key="h.id"
            >
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
                @click="show(h.id)"
              >
                <span class="min-w-0 flex-1">
                  <span :class="['block font-medium', h.state === 'void' ? 'text-muted line-through' : '']">{{ h.holder ?? t('box-office.passes.holders.nobody') }}</span>
                  <span class="block text-sm text-muted">{{ describe(h) }}</span>
                </span>
                <UBadge
                  v-if="h.state === 'void'"
                  color="neutral"
                  variant="subtle"
                  :label="t('box-office.passes.holders.badge.cancelled')"
                />
                <UBadge
                  v-else
                  :color="h.paidAt ? 'success' : 'warning'"
                  variant="subtle"
                  :label="t(h.paidAt ? 'box-office.passes.holders.badge.paid' : 'box-office.passes.holders.badge.not-paid')"
                />
                <UIcon
                  name="i-lucide-chevron-right"
                  class="shrink-0 text-muted"
                />
              </button>
            </li>
          </RecordList>
        </template>
      </div>
    </template>
  </USlideover>
</template>
