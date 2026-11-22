<!-- A failed first load shows only the reason and one way on, never a half-filled page: Try again
     where trying again can help, the way back where it cannot (not found, not allowed, gone). -->
<script setup lang="ts">
const props = defineProps<{ reason: string, retrying?: boolean, /** The answer's HTTP status, when there was one. */ status?: number, remedy?: string, /** The refusal's code: one that somewhere else puts right (two-step sign-in) offers the way there. */ code?: string }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useT()
const route = useRoute()
// The frame names the parent page; without one, the address one step up is the way back.
const parent = inject<Ref<{ label: string, to: string } | undefined> | undefined>('core:page-parent', undefined)
const final = computed(() => [403, 404, 410].includes(props.status ?? 0)) // not-policy: the statuses a retry cannot change
const back = computed(() => parent?.value
  ? { label: t('core.trail.back-to', { where: parent.value.label }), to: parent.value.to }
  : { label: t('core.failed.back'), to: route.path.replace(/\/[^/]+\/?$/, '') || '/' })
const go = computed(() => refusalAction({ code: props.code }))
const actions = computed(() => go.value
  ? [{ label: go.value.label, trailingIcon: 'i-lucide-arrow-right', color: 'neutral' as const, variant: 'outline' as const, to: go.value.to }]
  : final.value
    ? [{ label: back.value.label, icon: 'i-lucide-arrow-left', color: 'neutral' as const, variant: 'outline' as const, to: back.value.to }]
    : [{ label: t('core.failed.retry'), icon: 'i-lucide-refresh-cw', color: 'neutral' as const, variant: 'outline' as const, loading: props.retrying, onClick: () => emit('retry') }])
</script>

<template>
  <UAlert
    role="alert"
    color="error"
    icon="i-lucide-circle-alert"
    :title="reason"
    :description="remedy"
    :actions="actions"
  />
</template>
