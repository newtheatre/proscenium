<!-- The holder's membership card on the members' area home (core.home-card, home 'members'): each
     membership they hold now, with Show card opening the card full screen. -->
<script setup lang="ts">
defineProps<{ count?: number }>()
interface Held { id: string, schemeName: string, endsOn: string | null, status: string }
const { t } = useT()
const { day } = useDates()
const { data } = await useAPI<{ number: { label: string } | null, memberships: Held[] }>('/api/membership/mine', { key: 'membership:mine' })
const held = computed(() => (data.value?.memberships ?? []).filter(m => m.status === 'current' || m.status === 'in-grace'))
const showing = ref<Held | null>(null)
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="m in held"
      :key="m.id"
      class="flex flex-wrap items-center justify-between gap-3"
    >
      <div class="min-w-0">
        <p class="font-medium">
          {{ m.schemeName }}
        </p>
        <p class="text-sm text-muted">
          {{ [data?.number?.label, m.endsOn ? t('membership.screens.mine.until', { date: day(m.endsOn) }) : t('membership.screens.mine.no-end')].filter(Boolean).join(' · ') }}
        </p>
      </div>
      <UButton
        icon="i-lucide-qr-code"
        :label="t('membership.screens.mine.show-card')"
        @click="showing = m"
      />
    </div>
    <UButton
      to="/account/membership"
      color="neutral"
      variant="link"
      class="px-0"
      trailing-icon="i-lucide-arrow-right"
      :label="t('membership.screens.home-card.card-action')"
    />
    <MembershipCardModal
      :membership="showing"
      :number="data?.number?.label"
      @close="showing = null"
    />
  </div>
</template>
