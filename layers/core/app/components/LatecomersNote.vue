<!-- When latecomers are let in to a performance (Matt, 2026-11-19: decided show by show). For the
     public it reads as a sentence, with the house rules a press away; for staff in live mode it is a
     badge that can be read at a glance. -->
<script setup lang="ts">
withDefaults(defineProps<{
  rule: string
  /** A badge, for staff in live mode. */
  staff?: boolean
  /** Link to the house rules, which explain all four ways. */
  rules?: boolean
}>(), { staff: false, rules: false })

const { t } = useT()
</script>

<template>
  <UBadge
    v-if="staff"
    color="neutral"
    variant="subtle"
    size="lg"
    icon="i-lucide-clock-alert"
    :label="`${t('core.live.latecomers')}: ${t(`core.latecomers.short.${rule}`)}`"
    class="self-start"
  />
  <p
    v-else
    class="flex items-start gap-2 text-sm"
  >
    <UIcon
      name="i-lucide-clock-alert"
      class="mt-0.5 size-4 shrink-0 text-muted"
    />
    <span>{{ t(`core.latecomers.${rule}`) }}{{ rules ? ' ' : '' }}<template v-if="rules"><ULink
      to="/policies/visiting#section-if-you-are-late"
      class="text-muted underline underline-offset-2 hover:text-primary"
    >{{ t('core.latecomers.rules') }}</ULink></template></span>
  </p>
</template>
