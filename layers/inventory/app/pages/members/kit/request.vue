<!-- Request kit (S13, INV-20): the dates, what it is for and the basket. A mixed basket goes as one
     request per department, said before sending (L2); each department decides its own. -->
<script setup lang="ts">
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { dates, lines, remove, clear, departments } = useKitBasket()
const purpose = ref('')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const validate = () => needs({ dates: dates.value.end, purpose: purpose.value.trim() })

async function send() {
  refusal.value = null
  busy.value = true
  try {
    const { loanIds } = await $api<{ loanIds: string[] }>('/api/inventory/requests', { method: 'POST', body: {
      startsOn: dates.value.start, dueBackOn: dates.value.end, purpose: purpose.value, lines: lines.value.map(l => ({ itemId: l.item.id, quantity: l.quantity })),
    } })
    clear()
    toast.add({ title: t('inventory.borrow.sent', { count: loanIds.length }), color: 'success' })
    await navigateTo('/members/kit/loans')
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
    :title="t('inventory.borrow.request-title')"
    :trail="[{ label: t('inventory.borrow.title'), to: '/members/kit' }]"
    width="reading"
  >
    <EmptyState
      v-if="!lines.length"
      icon="i-lucide-shopping-basket"
      :title="t('inventory.borrow.empty')"
    >
      <UButton
        to="/members/kit"
        :label="t('inventory.borrow.title')"
      />
    </EmptyState>
    <UForm
      v-else
      class="space-y-4"
      :state="{ dates, purpose }"
      :validate="validate"
      novalidate
      @submit="send"
    >
      <RefusalNotice :refusal="refusal" />
      <UFormField
        name="dates"
        :label="t('inventory.borrow.dates')"
        required
      >
        <FieldDateRange v-model="dates" />
      </UFormField>
      <UFormField
        name="purpose"
        :label="t('inventory.borrow.purpose')"
        :help="t('inventory.borrow.purpose-help')"
        required
      >
        <UTextarea
          v-model="purpose"
          maxlength="500"
          :rows="2"
        />
      </UFormField>
      <RecordList :label="t('inventory.loan.lines')">
        <RecordListItem
          v-for="l in lines"
          :key="l.item.id"
          icon="i-lucide-package"
          :name="l.item.name"
          :description="`${l.item.department} · ${l.item.tag}`"
        >
          <FieldNumber
            v-if="l.item.tracking === 'counted'"
            v-model="l.quantity"
            :min="1"
            :aria-label="t('inventory.borrow.how-many', { name: l.item.name })"
          />
          <template #trailing>
            <IconButton
              icon="i-lucide-x"
              :label="t('inventory.borrow.remove-named', { name: l.item.name })"
              @click="remove(l.item.id)"
            />
          </template>
        </RecordListItem>
      </RecordList>
      <UAlert
        v-if="departments.length > 1"
        color="info"
        variant="subtle"
        :title="t('inventory.borrow.split', { count: departments.length, departments: departments.join(', ') })"
      />
      <UButton
        type="submit"
        :loading="busy"
        :label="t('inventory.borrow.send', { count: departments.length })"
      />
    </UForm>
  </PageFrame>
</template>
