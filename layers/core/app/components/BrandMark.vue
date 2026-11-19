<!-- The theatre's mark in a shell's header (C-35): its logo, in the dark version where there is one,
     or its name when no logo is set. The logo's alt text falls back to the name. -->
<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'md' })
const { t } = useT()
const { data: brand } = await useBrand()
const name = computed(() => brand.value?.name ?? t('core.public.default-name'))
</script>

<template>
  <UColorModeImage
    v-if="brand?.logo"
    :light="brand.logo.url"
    :dark="brand.logoDark?.url ?? brand.logo.url"
    :alt="brand.logo.alt || name"
    :width="brand.logo.width ?? undefined"
    :height="brand.logo.height ?? undefined"
    :class="['w-auto max-w-full object-contain object-left', size === 'sm' ? 'h-8' : 'h-10']"
  />
  <span
    v-else
    class="truncate"
  >{{ name }}</span>
</template>
