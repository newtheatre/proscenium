<template>
  <div class="role-badges">
    <span
      v-if="roles.length === 0"
      class="text-muted"
    >
      User
    </span>
    <span
      v-for="role in roles"
      v-else
      :key="role"
      class="role-badge"
    >
      {{ formatRole(role) }}
    </span>
  </div>
</template>

<script lang="ts" setup>
import type { RoleType } from '@prisma/client'

interface Props {
  roles: RoleType[]
}

defineProps<Props>()

const { formatRole } = useFormatters()
</script>

<style scoped>
.role-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.role-badge {
  background: var(--nnt-orange);
  color: var(--primary-bg-color);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--border-radius-pill);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: var(--transition-fast);
}

.role-badge:hover {
  background: var(--secondary-bg-color);
  color: var(--primary-text-color);
  border: 1px solid var(--border-color);
}

.text-muted {
  color: var(--text-muted);
  font-style: italic;
}
</style>
