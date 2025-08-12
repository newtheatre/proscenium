<template>
  <div class="admin-section-grid">
    <AdminCard
      v-for="section in sections"
      :key="section.path"
      :title="section.title"
      :description="section.description"
      :path="section.path"
      :icon="section.icon"
    />
  </div>
</template>

<script setup lang="ts">
export interface AdminSection {
  title: string
  description: string
  path: string
  icon: string
}

interface Props {
  sections: AdminSection[]
}

defineProps<Props>()
</script>

<style scoped>
.admin-section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--spacing-lg);
  margin-top: var(--spacing-xl);
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .admin-section-grid {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }
}
</style>
