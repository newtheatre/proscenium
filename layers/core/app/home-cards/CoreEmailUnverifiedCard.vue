<!-- Admin's overview while no sending domain is verified (core.home-card): nothing is emailed, not
     even sign-in links, so staff cannot be brought in by an emailed link yet. -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-start gap-2">
      <UIcon
        name="i-lucide-mail-warning"
        class="mt-0.5 size-5 shrink-0 text-warning"
      />
      <div>
        <p class="font-medium">
          {{ t('core.email-unverified.title') }}
        </p>
        <p class="text-sm text-muted">
          {{ t('core.email-unverified.description') }}
        </p>
      </div>
    </div>
    <UButton
      to="/admin/email"
      :label="t('core.email-unverified.action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
