<script setup lang="ts">
// Every module's operator documentation, one list, so a page nobody linked to yet is still
// reachable (J-109 criterion 1).
definePageMeta({ middleware: 'signed-in' })

const { data: pages } = await useAsyncData('docs:index', () => queryCollection('docs').order('path', 'ASC').all())

useSeoMeta({ title: 'Documentation' })
</script>

<template>
  <div>
    <UPageHero
      title="Documentation"
      description="How each part of the system is run, kept by the people who run it."
    />

    <UContainer class="pb-16">
      <UPageGrid>
        <UPageCard
          v-for="doc in pages"
          :key="doc.path"
          :to="doc.path"
          :title="doc.title"
          :description="doc.description"
        >
          <template #footer>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              {{ doc.module }}
            </UBadge>
          </template>
        </UPageCard>
      </UPageGrid>
    </UContainer>
  </div>
</template>
